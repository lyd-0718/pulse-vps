package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type dockerContainerSummary struct {
	ID     string   `json:"Id"`
	Names  []string `json:"Names"`
	Image  string   `json:"Image"`
	State  string   `json:"State"`
	Status string   `json:"Status"`
}

type dockerStatsPayload struct {
	CPUStats struct {
		CPUUsage struct {
			TotalUsage  uint64   `json:"total_usage"`
			PercpuUsage []uint64 `json:"percpu_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
		OnlineCPUs     int    `json:"online_cpus"`
	} `json:"cpu_stats"`
	PreCPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
	} `json:"precpu_stats"`
	MemoryStats struct {
		Usage uint64            `json:"usage"`
		Limit uint64            `json:"limit"`
		Stats map[string]uint64 `json:"stats"`
	} `json:"memory_stats"`
}

func CalcDockerCPU(stats dockerStatsPayload) float64 {
	cpuDelta := float64(stats.CPUStats.CPUUsage.TotalUsage) - float64(stats.PreCPUStats.CPUUsage.TotalUsage)
	systemDelta := float64(stats.CPUStats.SystemCPUUsage) - float64(stats.PreCPUStats.SystemCPUUsage)
	if cpuDelta <= 0 || systemDelta <= 0 {
		return 0
	}
	cpus := stats.CPUStats.OnlineCPUs
	if cpus <= 0 {
		cpus = len(stats.CPUStats.CPUUsage.PercpuUsage)
	}
	if cpus <= 0 {
		cpus = 1
	}
	return (cpuDelta / systemDelta) * float64(cpus) * 100.0
}

func CalcDockerMem(stats dockerStatsPayload) (uint64, uint64) {
	usage := stats.MemoryStats.Usage
	if cache, ok := stats.MemoryStats.Stats["inactive_file"]; ok && usage > cache {
		usage -= cache
	} else if cache, ok := stats.MemoryStats.Stats["cache"]; ok && usage > cache {
		usage -= cache
	}
	return usage, stats.MemoryStats.Limit
}

func CollectDockerContainers(ctx context.Context, sockPath string) []ContainerInfo {
	if sockPath == "" {
		return []ContainerInfo{}
	}
	if _, err := os.Stat(sockPath); err != nil {
		return []ContainerInfo{}
	}

	client := &http.Client{
		Timeout: 3 * time.Second,
		Transport: &http.Transport{
			DialContext: func(dialCtx context.Context, _, _ string) (net.Conn, error) {
				var d net.Dialer
				return d.DialContext(dialCtx, "unix", sockPath)
			},
		},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://docker/containers/json?all=1", nil)
	if err != nil {
		return []ContainerInfo{}
	}
	resp, err := client.Do(req)
	if err != nil {
		return []ContainerInfo{}
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return []ContainerInfo{}
	}

	var list []dockerContainerSummary
	if err := json.NewDecoder(resp.Body).Decode(&list); err != nil {
		return []ContainerInfo{}
	}

	if len(list) > 30 {
		list = list[:30]
	}

	results := make([]ContainerInfo, len(list))
	sem := make(chan struct{}, 4)
	var wg sync.WaitGroup

	for i, item := range list {
		name := item.ID
		if len(name) > 12 {
			name = name[:12]
		}
		if len(item.Names) > 0 {
			name = strings.TrimPrefix(item.Names[0], "/")
		}
		info := ContainerInfo{
			ID:     item.ID[:min(12, len(item.ID))],
			Name:   name,
			Image:  item.Image,
			State:  item.State,
			Status: item.Status,
		}
		if strings.ToLower(item.State) != "running" {
			results[i] = info
			continue
		}

		wg.Add(1)
		go func(idx int, base ContainerInfo, fullID string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			statURL := fmt.Sprintf("http://docker/containers/%s/stats?stream=false", fullID)
			sReq, err := http.NewRequestWithContext(ctx, http.MethodGet, statURL, nil)
			if err == nil {
				sResp, err := client.Do(sReq)
				if err == nil {
					if sResp.StatusCode == http.StatusOK {
						var stats dockerStatsPayload
						if json.NewDecoder(sResp.Body).Decode(&stats) == nil {
							base.CPUPct = float64(int(CalcDockerCPU(stats)*10)) / 10
							base.MemUsed, base.MemLimit = CalcDockerMem(stats)
						}
					}
					sResp.Body.Close()
				}
			}
			results[idx] = base
		}(i, info, item.ID)
	}
	wg.Wait()
	return results
}
