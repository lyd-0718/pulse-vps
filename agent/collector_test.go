package main

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestIsCountedIface(t *testing.T) {
	if isCountedIface("lo") || isCountedIface("lo0") || isCountedIface("docker0") || isCountedIface("veth1234") {
		t.Fatal("expected loopback and virtual bridge interfaces to be ignored")
	}
	if !isCountedIface("eth0") || !isCountedIface("ens3") || !isCountedIface("en0") {
		t.Fatal("expected physical interfaces to be counted")
	}
}

func TestCalcDockerStats(t *testing.T) {
	var stats dockerStatsPayload
	stats.CPUStats.CPUUsage.TotalUsage = 2_000_000_000
	stats.PreCPUStats.CPUUsage.TotalUsage = 1_000_000_000
	stats.CPUStats.SystemCPUUsage = 10_000_000_000
	stats.PreCPUStats.SystemCPUUsage = 5_000_000_000
	stats.CPUStats.OnlineCPUs = 2
	stats.MemoryStats.Usage = 256 * 1024 * 1024
	stats.MemoryStats.Limit = 1024 * 1024 * 1024
	stats.MemoryStats.Stats = map[string]uint64{"inactive_file": 56 * 1024 * 1024}

	cpuPct := CalcDockerCPU(stats)
	if cpuPct < 39.9 || cpuPct > 40.1 {
		t.Fatalf("expected 40.0%% CPU, got %.2f%%", cpuPct)
	}
	used, limit := CalcDockerMem(stats)
	if used != 200*1024*1024 || limit != 1024*1024*1024 {
		t.Fatalf("unexpected memory calculation: used=%d limit=%d", used, limit)
	}
}

func TestRunProbesTCPAndHTTP(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to listen tcp: %v", err)
	}
	defer ln.Close()
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			_ = c.Close()
		}
	}()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	targets := []ProbeTarget{
		{ID: "t1", Name: "local tcp", Type: "tcp_node", Target: ln.Addr().String()},
		{ID: "t2", Name: "local http", Type: "http_node", Target: srv.URL, ExpectedStatus: 200},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	results := RunProbes(ctx, targets)
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}
	for _, r := range results {
		if !r.OK {
			t.Fatalf("expected probe %s to succeed, got %+v", r.TargetID, r)
		}
	}
}

func TestCollectorCollect(t *testing.T) {
	c := NewCollector("/nonexistent/docker.sock")
	time.Sleep(150 * time.Millisecond)
	p := c.Collect(context.Background(), nil)
	if p.MemTotal == 0 || p.CPUCores == 0 || p.DiskTotal == 0 {
		t.Fatalf("expected valid host hardware totals, got %+v", p)
	}
}
