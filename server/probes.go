package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

func RunEdgeProbes(ctx context.Context, store *Store, alerts *AlertEngine) (int, error) {
	targets, err := store.ListProbeTargets()
	if err != nil {
		return 0, err
	}
	var edgeTargets []ProbeTargetDto
	for _, t := range targets {
		if t.Enabled && t.Type == "http_edge" {
			edgeTargets = append(edgeTargets, t)
		}
	}
	if len(edgeTargets) == 0 {
		return 0, nil
	}

	client := &http.Client{Timeout: 8 * time.Second}
	now := time.Now().UnixMilli()

	type outcome struct {
		target ProbeTargetDto
		rec    EdgeProbeRecord
	}
	results := make([]outcome, len(edgeTargets))
	var wg sync.WaitGroup
	for i, target := range edgeTargets {
		wg.Add(1)
		go func(idx int, t ProbeTargetDto) {
			defer wg.Done()
			started := time.Now()
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, t.Target, nil)
			if err != nil {
				results[idx] = outcome{target: t, rec: EdgeProbeRecord{Ts: now, OK: false, LatencyMs: 1, Error: err.Error()}}
				return
			}
			req.Header.Set("User-Agent", "PulseVPS-EdgeProbe/1.1")
			resp, err := client.Do(req)
			lat := time.Since(started).Milliseconds()
			if lat < 1 {
				lat = 1
			}
			if err != nil {
				msg := err.Error()
				if len(msg) > 120 {
					msg = msg[:120]
				}
				results[idx] = outcome{target: t, rec: EdgeProbeRecord{Ts: now, OK: false, LatencyMs: lat, Error: msg}}
				return
			}
			_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
			_ = resp.Body.Close()
			ok := resp.StatusCode >= 200 && resp.StatusCode < 400
			if t.ExpectedStatus > 0 && resp.StatusCode == t.ExpectedStatus {
				ok = true
			}
			errStr := ""
			if !ok {
				errStr = fmt.Sprintf("HTTP %d", resp.StatusCode)
			}
			results[idx] = outcome{
				target: t,
				rec:    EdgeProbeRecord{Ts: now, OK: ok, StatusCode: resp.StatusCode, LatencyMs: lat, Error: errStr},
			}
		}(i, target)
	}
	wg.Wait()

	tx, err := store.db.Begin()
	if err != nil {
		return 0, err
	}
	stmt, err := tx.Prepare("INSERT INTO edge_probe_history (target_id, ts, ok, status_code, latency_ms, error) VALUES (?, ?, ?, ?, ?, ?)")
	if err != nil {
		_ = tx.Rollback()
		return 0, err
	}
	defer stmt.Close()
	for _, r := range results {
		okInt := 0
		if r.rec.OK {
			okInt = 1
		}
		if _, err := stmt.Exec(r.target.ID, r.rec.Ts, okInt, r.rec.StatusCode, r.rec.LatencyMs, r.rec.Error); err != nil {
			_ = tx.Rollback()
			return 0, err
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}

	if alerts != nil {
		for _, r := range results {
			alerts.NotifyEdgeResult(ctx, r.target, r.rec.OK, r.rec.Error)
		}
	}
	return len(results), nil
}
