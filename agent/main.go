package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"
)

func sendReport(ctx context.Context, client *http.Client, serverURL, token string, payload AgentReportPayload) (*AgentResponse, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	endpoint := strings.TrimRight(serverURL, "/") + "/api/agent/report"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 128*1024))
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("server returned HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	var parsed AgentResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, err
	}
	return &parsed, nil
}

func main() {
	serverURL := flag.String("server", "", "PulseVPS server URL (e.g. https://vps.ydiws.xyz)")
	token := flag.String("token", "", "Node authentication token")
	interval := flag.Duration("interval", 2*time.Second, "Fast metrics reporting interval")
	probeInterval := flag.Duration("probe-interval", 20*time.Second, "Async TCP/HTTP probe interval")
	dockerSock := flag.String("docker-sock", "/var/run/docker.sock", "Docker unix socket path")
	netIface := flag.String("iface", "", "Network interface to monitor (auto-detects Linux default public route interface if empty)")
	once := flag.Bool("once", false, "Collect once, send report, and exit")
	flag.Parse()

	if strings.TrimSpace(*serverURL) == "" || strings.TrimSpace(*token) == "" {
		log.Fatal("both --server and --token are required")
	}
	if *interval < time.Second {
		*interval = time.Second
	}
	if *probeInterval < 5*time.Second {
		*probeInterval = 5 * time.Second
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	collector := NewCollector(*dockerSock, *netIface)
	log.Printf("pulse-vps-agent %s started (iface=%s, interval=%s, probeInterval=%s)",
		AgentVersion, collector.SelectedIface(), interval.String(), probeInterval.String())
	httpClient := &http.Client{Timeout: 8 * time.Second}

	// Brief warmup so CPU usage and network throughput rates have a valid delta on first report.
	select {
	case <-time.After(1100 * time.Millisecond):
	case <-ctx.Done():
		return
	}

	var probeMu sync.RWMutex
	var activeTargets []ProbeTarget
	var cachedProbes []NodeProbeResult
	probeWake := make(chan struct{}, 1)
	var probesPrimed bool

	getTargets := func() []ProbeTarget {
		probeMu.RLock()
		defer probeMu.RUnlock()
		cp := make([]ProbeTarget, len(activeTargets))
		copy(cp, activeTargets)
		return cp
	}

	setTargets := func(next []ProbeTarget) {
		probeMu.Lock()
		changed := len(next) != len(activeTargets)
		if !changed {
			for i := range next {
				if next[i].ID != activeTargets[i].ID || next[i].Target != activeTargets[i].Target || next[i].Type != activeTargets[i].Type {
					changed = true
					break
				}
			}
		}
		activeTargets = next
		needInitial := !probesPrimed && len(next) > 0
		if needInitial {
			probesPrimed = true
		}
		probeMu.Unlock()
		if changed || needInitial {
			select {
			case probeWake <- struct{}{}:
			default:
			}
		}
	}

	getProbes := func() []NodeProbeResult {
		probeMu.RLock()
		defer probeMu.RUnlock()
		if len(cachedProbes) == 0 {
			return nil
		}
		cp := make([]NodeProbeResult, len(cachedProbes))
		copy(cp, cachedProbes)
		return cp
	}

	// Background async probe loop so 23 TCPing checks never block 2s telemetry ticks
	if !*once {
		go func() {
			runNow := func() {
				targets := getTargets()
				if len(targets) == 0 {
					return
				}
				res := RunProbes(ctx, targets)
				probeMu.Lock()
				cachedProbes = res
				probeMu.Unlock()
			}
			ticker := time.NewTicker(*probeInterval)
			defer ticker.Stop()
			for {
				select {
				case <-probeWake:
					runNow()
				case <-ticker.C:
					runNow()
				case <-ctx.Done():
					return
				}
			}
		}()
	}

	var lastSummaryLog time.Time
	pushOnce := func(syncProbes bool) error {
		var probes []NodeProbeResult
		if syncProbes {
			probes = RunProbes(ctx, getTargets())
		} else {
			probes = getProbes()
		}
		payload := collector.Collect(ctx, probes)
		resp, err := sendReport(ctx, httpClient, *serverURL, *token, payload)
		if err != nil {
			return err
		}
		setTargets(resp.ProbeTargets)
		if time.Since(lastSummaryLog) >= 60*time.Second || *once {
			lastSummaryLog = time.Now()
			log.Printf("reported ok (cpu=%.1f%%, mem=%.0fMB/%.0fMB, rx=%.1fKB/s, tx=%.1fKB/s, containers=%d, probes=%d)",
				payload.CPUUsage,
				float64(payload.MemUsed)/1024/1024,
				float64(payload.MemTotal)/1024/1024,
				payload.NetRxSpeed/1024,
				payload.NetTxSpeed/1024,
				len(payload.Containers),
				len(payload.Probes),
			)
		}
		return nil
	}

	if err := pushOnce(false); err != nil {
		if *once {
			log.Fatalf("report failed: %v", err)
		}
		log.Printf("initial report error: %v", err)
	}

	if *once {
		if len(getTargets()) > 0 {
			time.Sleep(300 * time.Millisecond)
			if err := pushOnce(true); err != nil {
				log.Fatalf("second pass with probes failed: %v", err)
			}
		}
		return
	}

	ticker := time.NewTicker(*interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := pushOnce(false); err != nil {
				log.Printf("report error: %v", err)
			}
		case <-ctx.Done():
			log.Println("agent shutting down")
			return
		}
	}
}
