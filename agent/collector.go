package main

import (
	"bufio"
	"context"
	"io"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
	gnet "github.com/shirou/gopsutil/v4/net"
	"github.com/shirou/gopsutil/v4/process"
)

type Collector struct {
	mu               sync.Mutex
	dockerSock       string
	netIface         string
	prevRx           uint64
	prevTx           uint64
	prevAt           time.Time
	hasNetBaseline   bool
	cachedContainers []ContainerInfo
	lastDockerAt     time.Time
	cachedIP         string
	lastIPAt         time.Time
}

func NewCollector(dockerSock string, preferredIface string) *Collector {
	iface := strings.TrimSpace(preferredIface)
	if iface == "" && runtime.GOOS == "linux" {
		iface = detectDefaultRouteIface()
	}
	c := &Collector{
		dockerSock: dockerSock,
		netIface:   iface,
	}
	// Prime CPU percent and network baseline counters.
	_, _ = cpu.Percent(0, false)
	if rx, tx, ok := readPhysicalNetBytes(context.Background(), c.netIface); ok {
		c.prevRx = rx
		c.prevTx = tx
		c.prevAt = time.Now()
		c.hasNetBaseline = true
	}
	return c
}

func (c *Collector) SelectedIface() string {
	if c.netIface != "" {
		return c.netIface
	}
	return "auto-physical"
}

// parseDefaultRouteIface extracts the Linux default-gateway interface (e.g. eth0 / ens3)
// from /proc/net/route text so tunnel/VPN virtual interfaces are never double-counted.
func parseDefaultRouteIface(routeContent string) string {
	scanner := bufio.NewScanner(strings.NewReader(routeContent))
	firstLine := true
	bestIface := ""
	bestMetric := int(^uint(0) >> 1)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if firstLine {
			firstLine = false
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 8 {
			continue
		}
		iface := fields[0]
		dest := fields[1]
		flagsHex := fields[3]
		metricStr := fields[6]
		mask := fields[7]

		if dest != "00000000" || mask != "00000000" {
			continue
		}
		flags, err := strconv.ParseUint(flagsHex, 16, 32)
		if err != nil || (flags&0x1) == 0 {
			continue
		}
		if !isCountedIface(iface) {
			continue
		}
		metric, err := strconv.Atoi(metricStr)
		if err != nil {
			metric = 0
		}
		if bestIface == "" || metric < bestMetric {
			bestIface = iface
			bestMetric = metric
		}
	}
	return bestIface
}

func detectDefaultRouteIface() string {
	raw, err := os.ReadFile("/proc/net/route")
	if err != nil {
		return ""
	}
	return parseDefaultRouteIface(string(raw))
}

func isCountedIface(name string) bool {
	lower := strings.ToLower(name)
	ignoredPrefixes := []string{
		"lo", "docker", "veth", "br-", "virbr", "cni", "flannel", "cali",
		"wg", "tun", "tap", "tailscale", "warp", "sing", "zt", "sit", "gre", "ip6tnl", "dummy",
		"awdl", "llw", "utun", "anpi", "bridge", "gif", "stf",
	}
	for _, prefix := range ignoredPrefixes {
		if strings.HasPrefix(lower, prefix) {
			return false
		}
	}
	return true
}

func readPhysicalNetBytes(ctx context.Context, targetIface string) (uint64, uint64, bool) {
	counters, err := gnet.IOCountersWithContext(ctx, true)
	if err != nil {
		return 0, 0, false
	}
	if targetIface != "" {
		for _, item := range counters {
			if item.Name == targetIface {
				return item.BytesRecv, item.BytesSent, true
			}
		}
	}
	var rx, tx uint64
	for _, item := range counters {
		if !isCountedIface(item.Name) {
			continue
		}
		rx += item.BytesRecv
		tx += item.BytesSent
	}
	return rx, tx, true
}

func (c *Collector) resolvePublicIP() string {
	c.mu.Lock()
	if time.Since(c.lastIPAt) < 10*time.Minute && c.cachedIP != "" {
		ip := c.cachedIP
		c.mu.Unlock()
		return ip
	}
	c.mu.Unlock()

	client := &http.Client{Timeout: 2 * time.Second}
	for _, endpoint := range []string{"https://api4.ipify.org", "https://ipv4.icanhazip.com"} {
		resp, err := client.Get(endpoint)
		if err != nil {
			continue
		}
		body, err := io.ReadAll(io.LimitReader(resp.Body, 64))
		resp.Body.Close()
		if err == nil {
			ip := strings.TrimSpace(string(body))
			if ip != "" && !strings.Contains(ip, "<") {
				c.mu.Lock()
				c.cachedIP = ip
				c.lastIPAt = time.Now()
				c.mu.Unlock()
				return ip
			}
		}
	}
	return c.cachedIP
}

func (c *Collector) Collect(ctx context.Context, probes []NodeProbeResult) AgentReportPayload {
	payload := AgentReportPayload{
		Arch:       runtime.GOARCH,
		Containers: []ContainerInfo{},
		Probes:     probes,
	}
	if payload.Probes == nil {
		payload.Probes = []NodeProbeResult{}
	}

	if hInfo, err := host.InfoWithContext(ctx); err == nil {
		osName := strings.TrimSpace(hInfo.Platform + " " + hInfo.PlatformVersion)
		if osName == "" {
			osName = hInfo.OS
		}
		payload.OS = osName
		payload.Kernel = hInfo.KernelVersion
		payload.Uptime = hInfo.Uptime
		if hInfo.KernelArch != "" {
			payload.Arch = hInfo.KernelArch
		}
	}

	if cores, err := cpu.CountsWithContext(ctx, true); err == nil {
		payload.CPUCores = cores
	}
	if cpuInfos, err := cpu.InfoWithContext(ctx); err == nil && len(cpuInfos) > 0 {
		payload.CPUModel = strings.TrimSpace(cpuInfos[0].ModelName)
		if payload.CPUCores == 0 {
			payload.CPUCores = int(cpuInfos[0].Cores)
		}
	}
	if percents, err := cpu.PercentWithContext(ctx, 0, false); err == nil && len(percents) > 0 {
		payload.CPUUsage = percents[0]
	}

	if lAvg, err := load.AvgWithContext(ctx); err == nil {
		payload.Load1 = lAvg.Load1
		payload.Load5 = lAvg.Load5
		payload.Load15 = lAvg.Load15
	}

	if vm, err := mem.VirtualMemoryWithContext(ctx); err == nil {
		payload.MemTotal = vm.Total
		payload.MemUsed = vm.Used
	}
	if sw, err := mem.SwapMemoryWithContext(ctx); err == nil {
		payload.SwapTotal = sw.Total
		payload.SwapUsed = sw.Used
	}
	if du, err := disk.UsageWithContext(ctx, "/"); err == nil {
		payload.DiskTotal = du.Total
		payload.DiskUsed = du.Used
	}

	if pids, err := process.PidsWithContext(ctx); err == nil {
		payload.ProcCount = len(pids)
	}
	if conns, err := gnet.ConnectionsWithContext(ctx, "tcp"); err == nil {
		payload.TCPConns = len(conns)
	}

	now := time.Now()
	if rx, tx, ok := readPhysicalNetBytes(ctx, c.netIface); ok {
		payload.NetRxTotal = rx
		payload.NetTxTotal = tx
		c.mu.Lock()
		if c.hasNetBaseline {
			elapsed := now.Sub(c.prevAt).Seconds()
			if elapsed > 0.2 {
				if rx >= c.prevRx {
					payload.NetRxSpeed = float64(rx-c.prevRx) / elapsed
				}
				if tx >= c.prevTx {
					payload.NetTxSpeed = float64(tx-c.prevTx) / elapsed
				}
			}
		}
		c.prevRx = rx
		c.prevTx = tx
		c.prevAt = now
		c.hasNetBaseline = true
		c.mu.Unlock()
	}

	payload.IP = c.resolvePublicIP()

	c.mu.Lock()
	shouldRefreshDocker := time.Since(c.lastDockerAt) >= 25*time.Second || c.lastDockerAt.IsZero()
	cached := c.cachedContainers
	c.mu.Unlock()

	if shouldRefreshDocker {
		fresh := CollectDockerContainers(ctx, c.dockerSock)
		c.mu.Lock()
		c.cachedContainers = fresh
		c.lastDockerAt = time.Now()
		c.mu.Unlock()
		payload.Containers = fresh
	} else if cached != nil {
		payload.Containers = cached
	}

	return payload
}
