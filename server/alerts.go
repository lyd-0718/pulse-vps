package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"strings"
	"time"
)

type AlertEngine struct {
	store  *Store
	client *http.Client
}

func NewAlertEngine(store *Store) *AlertEngine {
	return &AlertEngine{
		store:  store,
		client: &http.Client{Timeout: 8 * time.Second},
	}
}

func (a *AlertEngine) Send(ctx context.Context, cfg *AlertConfig, title, body string) error {
	if cfg == nil {
		return fmt.Errorf("未配置告警通道")
	}
	text := fmt.Sprintf("【PulseVPS 告警】%s\n%s\n时间：%s (UTC+8)",
		title, body, time.Now().UTC().Add(8*time.Hour).Format("2006-01-02 15:04:05"))

	switch cfg.Channel {
	case "telegram":
		if strings.TrimSpace(cfg.TelegramToken) == "" || strings.TrimSpace(cfg.TelegramChatID) == "" {
			return fmt.Errorf("请填写 Telegram Bot Token 和 Chat ID")
		}
		endpoint := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", strings.TrimSpace(cfg.TelegramToken))
		payload, _ := json.Marshal(map[string]any{
			"chat_id": strings.TrimSpace(cfg.TelegramChatID),
			"text":    text,
		})
		return a.postJSON(ctx, endpoint, payload)

	case "feishu":
		if strings.TrimSpace(cfg.WebhookURL) == "" {
			return fmt.Errorf("请填写飞书机器人 Webhook 地址")
		}
		payload, _ := json.Marshal(map[string]any{
			"msg_type": "text",
			"content":  map[string]string{"text": text},
		})
		return a.postJSON(ctx, strings.TrimSpace(cfg.WebhookURL), payload)

	default:
		if strings.TrimSpace(cfg.WebhookURL) == "" {
			return fmt.Errorf("请填写 Webhook URL")
		}
		payload, _ := json.Marshal(map[string]any{
			"source":    "PulseVPS",
			"title":     title,
			"message":   body,
			"text":      text,
			"timestamp": time.Now().UnixMilli(),
		})
		return a.postJSON(ctx, strings.TrimSpace(cfg.WebhookURL), payload)
	}
}

func (a *AlertEngine) postJSON(ctx context.Context, endpoint string, body []byte) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "PulseVPS-Alert/1.0")
	resp, err := a.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("推送接口返回 HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}
	return nil
}

func (a *AlertEngine) getAlertState(key string) (active bool, lastNotified int64, lastVal string) {
	var act int
	err := a.store.db.QueryRow("SELECT active, last_notified_at, COALESCE(last_value,'') FROM alert_state WHERE key = ?", key).
		Scan(&act, &lastNotified, &lastVal)
	if err != nil {
		return false, 0, ""
	}
	return act == 1, lastNotified, lastVal
}

func (a *AlertEngine) setAlertState(key string, active bool, nowMs int64, val string) {
	actInt := 0
	if active {
		actInt = 1
	}
	_, _ = a.store.db.Exec(
		"INSERT OR REPLACE INTO alert_state (key, active, last_notified_at, last_value) VALUES (?, ?, ?, ?)",
		key, actInt, nowMs, val,
	)
}

func (a *AlertEngine) Evaluate(ctx context.Context) {
	settings, err := a.store.ReadSettings(true)
	if err != nil || settings.Alerts == nil || !settings.Alerts.Enabled {
		return
	}
	cfg := settings.Alerts
	now := time.Now().UnixMilli()

	nodes, err := a.store.ListNodesRaw()
	if err != nil {
		return
	}

	for _, n := range nodes {
		// 1. Offline / Recovery detection (only for nodes that have reported at least once)
		if cfg.NotifyOffline && n.lastSeenAt > 0 {
			offline := now-n.lastSeenAt > onlineWindowMs
			key := "offline:" + n.id
			wasActive, _, _ := a.getAlertState(key)
			if offline && !wasActive {
				msg := fmt.Sprintf("主机 %s (%s) 已失联超过 45 秒，请检查网络或服务状态。", n.name, n.ip)
				if err := a.Send(ctx, cfg, "主机离线 · "+n.name, msg); err != nil {
					log.Printf("alert send error: %v", err)
				} else {
					a.setAlertState(key, true, now, "offline")
				}
			} else if !offline && wasActive {
				msg := fmt.Sprintf("主机 %s (%s) 已恢复在线心跳。", n.name, n.ip)
				if err := a.Send(ctx, cfg, "主机恢复 · "+n.name, msg); err != nil {
					log.Printf("alert recovery send error: %v", err)
				} else {
					a.setAlertState(key, false, now, "online")
				}
			}
		}

		// 2. Monthly traffic quota threshold alert (once per cycle)
		if cfg.TrafficWarnPct > 0 && n.trafficLimitGb > 0 {
			base := normalizeUnitBase(n.trafficUnitBase, 1024)
			limitBytes := n.trafficLimitGb * math.Pow(float64(base), 3)
			usedBytes := float64(computeTrafficUsed(n.trafficRxCycle, n.trafficTxCycle, n.trafficMode))
			pct := (usedBytes / limitBytes) * 100
			key := "traffic:" + n.id
			wasActive, _, lastCycle := a.getAlertState(key)
			if pct >= float64(cfg.TrafficWarnPct) {
				if !wasActive || lastCycle != n.trafficCycleKey {
					usedGb := usedBytes / math.Pow(float64(base), 3)
					msg := fmt.Sprintf("主机 %s 本月流量已使用 %.1f GB / %.0f GB (%.1f%%)，达到 %d%% 预警阈值。",
						n.name, usedGb, n.trafficLimitGb, pct, cfg.TrafficWarnPct)
					if err := a.Send(ctx, cfg, "流量预警 · "+n.name, msg); err == nil {
						a.setAlertState(key, true, now, n.trafficCycleKey)
					}
				}
			} else if wasActive && lastCycle != n.trafficCycleKey {
				a.setAlertState(key, false, now, n.trafficCycleKey)
			}
		}

		// 3. Manual renewal expiry reminder (once per 24h when <= ExpireWarnDays)
		if cfg.ExpireWarnDays > 0 && n.autoRenew == 0 && n.expireDate != "" {
			if t, err := time.Parse("2006-01-02", n.expireDate); err == nil {
				daysLeft := int(math.Ceil(time.Until(t.Add(23*time.Hour+59*time.Minute)).Hours() / 24))
				key := "expire:" + n.id
				_, lastNotified, _ := a.getAlertState(key)
				if daysLeft <= cfg.ExpireWarnDays && now-lastNotified >= 24*3600_000 {
					statusTxt := fmt.Sprintf("剩余 %d 天到期", daysLeft)
					if daysLeft <= 0 {
						statusTxt = "已到期"
					}
					msg := fmt.Sprintf("主机 %s（手动续费）到期日 %s，当前%s，请及时处理续费。", n.name, n.expireDate, statusTxt)
					if err := a.Send(ctx, cfg, "到期提醒 · "+n.name, msg); err == nil {
						a.setAlertState(key, true, now, n.expireDate)
					}
				}
			}
		}
	}
}

func (a *AlertEngine) NotifyEdgeResult(ctx context.Context, target ProbeTargetDto, ok bool, errMsg string) {
	settings, err := a.store.ReadSettings(true)
	if err != nil || settings.Alerts == nil || !settings.Alerts.Enabled || !settings.Alerts.NotifyEdgeDown {
		return
	}
	cfg := settings.Alerts
	now := time.Now().UnixMilli()
	key := "edge:" + target.ID
	wasActive, _, _ := a.getAlertState(key)
	if !ok && !wasActive {
		msg := fmt.Sprintf("外部站点 %s (%s) 探测失败：%s", target.Name, target.Target, errMsg)
		if err := a.Send(ctx, cfg, "站点不可用 · "+target.Name, msg); err == nil {
			a.setAlertState(key, true, now, errMsg)
		}
	} else if ok && wasActive {
		msg := fmt.Sprintf("外部站点 %s (%s) 已恢复正常访问。", target.Name, target.Target)
		if err := a.Send(ctx, cfg, "站点恢复 · "+target.Name, msg); err == nil {
			a.setAlertState(key, false, now, "ok")
		}
	}
}
