package main

import (
	"context"
	"io"
	"net"
	"net/http"
	"sync"
	"time"
)

func RunProbes(ctx context.Context, targets []ProbeTarget) []NodeProbeResult {
	if len(targets) == 0 {
		return []NodeProbeResult{}
	}
	results := make([]NodeProbeResult, len(targets))
	var wg sync.WaitGroup
	httpClient := &http.Client{Timeout: 5 * time.Second}

	for i, target := range targets {
		wg.Add(1)
		go func(idx int, t ProbeTarget) {
			defer wg.Done()
			now := time.Now().UnixMilli()
			switch t.Type {
			case "tcp_node":
				results[idx] = probeTCP(ctx, t, now)
			case "http_node":
				results[idx] = probeHTTP(ctx, httpClient, t, now)
			default:
				results[idx] = NodeProbeResult{
					TargetID: t.ID,
					Name:     t.Name,
					Type:     t.Type,
					Target:   t.Target,
					OK:       false,
					LossPct:  100,
					Ts:       now,
				}
			}
		}(i, target)
	}
	wg.Wait()
	return results
}

func probeTCP(ctx context.Context, t ProbeTarget, ts int64) NodeProbeResult {
	const attempts = 3
	var totalMs float64
	var okCount int
	dialer := net.Dialer{Timeout: 2 * time.Second}

	for i := 0; i < attempts; i++ {
		started := time.Now()
		conn, err := dialer.DialContext(ctx, "tcp", t.Target)
		if err == nil {
			totalMs += float64(time.Since(started).Microseconds()) / 1000.0
			okCount++
			_ = conn.Close()
		}
	}

	lossPct := float64(attempts-okCount) / float64(attempts) * 100.0
	avgMs := 0.0
	if okCount > 0 {
		avgMs = float64(int((totalMs/float64(okCount))*10)) / 10.0
	}
	return NodeProbeResult{
		TargetID:  t.ID,
		Name:      t.Name,
		Type:      t.Type,
		Target:    t.Target,
		OK:        okCount > 0,
		LatencyMs: avgMs,
		LossPct:   float64(int(lossPct*10)) / 10.0,
		Ts:        ts,
	}
}

func probeHTTP(ctx context.Context, client *http.Client, t ProbeTarget, ts int64) NodeProbeResult {
	started := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, t.Target, nil)
	if err != nil {
		return NodeProbeResult{TargetID: t.ID, Name: t.Name, Type: t.Type, Target: t.Target, OK: false, LossPct: 100, Ts: ts}
	}
	req.Header.Set("User-Agent", "PulseVPS-Agent/1.0")
	resp, err := client.Do(req)
	elapsed := float64(time.Since(started).Microseconds()) / 1000.0
	if err != nil {
		return NodeProbeResult{TargetID: t.ID, Name: t.Name, Type: t.Type, Target: t.Target, OK: false, LatencyMs: 0, LossPct: 100, Ts: ts}
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	resp.Body.Close()

	ok := resp.StatusCode >= 200 && resp.StatusCode < 400
	if t.ExpectedStatus > 0 && resp.StatusCode == t.ExpectedStatus {
		ok = true
	}
	return NodeProbeResult{
		TargetID:   t.ID,
		Name:       t.Name,
		Type:       t.Type,
		Target:     t.Target,
		OK:         ok,
		LatencyMs:  float64(int(elapsed*10)) / 10.0,
		LossPct:    map[bool]float64{true: 0, false: 100}[ok],
		StatusCode: resp.StatusCode,
		Ts:         ts,
	}
}
