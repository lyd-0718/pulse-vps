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

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
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
	interval := flag.Duration("interval", 15*time.Second, "Reporting interval")
	dockerSock := flag.String("docker-sock", "/var/run/docker.sock", "Docker unix socket path")
	once := flag.Bool("once", false, "Collect once, send report, and exit")
	flag.Parse()

	if strings.TrimSpace(*serverURL) == "" || strings.TrimSpace(*token) == "" {
		log.Fatal("both --server and --token are required")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	collector := NewCollector(*dockerSock)
	httpClient := &http.Client{Timeout: 10 * time.Second}

	// Brief warmup so CPU usage and network throughput rates have a valid delta on first report.
	select {
	case <-time.After(1100 * time.Millisecond):
	case <-ctx.Done():
		return
	}

	var activeTargets []ProbeTarget

	pushOnce := func() error {
		probeResults := RunProbes(ctx, activeTargets)
		payload := collector.Collect(ctx, probeResults)
		resp, err := sendReport(ctx, httpClient, *serverURL, *token, payload)
		if err != nil {
			return err
		}
		activeTargets = resp.ProbeTargets
		log.Printf("reported ok (cpu=%.1f%%, mem=%.0fMB/%.0fMB, rx=%.1fKB/s, tx=%.1fKB/s, containers=%d, probes=%d)",
			payload.CPUUsage,
			float64(payload.MemUsed)/1024/1024,
			float64(payload.MemTotal)/1024/1024,
			payload.NetRxSpeed/1024,
			payload.NetTxSpeed/1024,
			len(payload.Containers),
			len(payload.Probes),
		)
		return nil
	}

	if err := pushOnce(); err != nil {
		if *once {
			log.Fatalf("report failed: %v", err)
		}
		log.Printf("initial report error: %v", err)
	}

	if *once {
		// If the server returned probe targets on initial handshake, run one quick probe pass too.
		if len(activeTargets) > 0 {
			time.Sleep(300 * time.Millisecond)
			if err := pushOnce(); err != nil {
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
			if err := pushOnce(); err != nil {
				log.Printf("report error: %v", err)
			}
		case <-ctx.Done():
			log.Println("agent shutting down")
			return
		}
	}
}
