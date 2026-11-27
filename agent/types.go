package main

type ContainerInfo struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Image    string  `json:"image"`
	State    string  `json:"state"`
	Status   string  `json:"status"`
	CPUPct   float64 `json:"cpuPct"`
	MemUsed  uint64  `json:"memUsed"`
	MemLimit uint64  `json:"memLimit"`
}

type ProbeTarget struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Type           string `json:"type"`
	Target         string `json:"target"`
	ExpectedStatus int    `json:"expectedStatus"`
}

type NodeProbeResult struct {
	TargetID   string  `json:"targetId"`
	Name       string  `json:"name"`
	Type       string  `json:"type"`
	Target     string  `json:"target"`
	OK         bool    `json:"ok"`
	LatencyMs  float64 `json:"latencyMs"`
	LossPct    float64 `json:"lossPct"`
	StatusCode int     `json:"statusCode,omitempty"`
	Ts         int64   `json:"ts"`
}

type AgentReportPayload struct {
	IP         string            `json:"ip,omitempty"`
	IPv6       string            `json:"ipv6,omitempty"`
	OS         string            `json:"os"`
	Arch       string            `json:"arch"`
	Kernel     string            `json:"kernel"`
	CPUModel   string            `json:"cpuModel"`
	CPUCores   int               `json:"cpuCores"`
	MemTotal   uint64            `json:"memTotal"`
	SwapTotal  uint64            `json:"swapTotal"`
	DiskTotal  uint64            `json:"diskTotal"`
	Uptime     uint64            `json:"uptime"`
	CPUUsage   float64           `json:"cpuUsage"`
	Load1      float64           `json:"load1"`
	Load5      float64           `json:"load5"`
	Load15     float64           `json:"load15"`
	MemUsed    uint64            `json:"memUsed"`
	SwapUsed   uint64            `json:"swapUsed"`
	DiskUsed   uint64            `json:"diskUsed"`
	NetRxSpeed float64           `json:"netRxSpeed"`
	NetTxSpeed float64           `json:"netTxSpeed"`
	NetRxTotal uint64            `json:"netRxTotal"`
	NetTxTotal uint64            `json:"netTxTotal"`
	TCPConns   int               `json:"tcpConns"`
	ProcCount  int               `json:"procCount"`
	Containers []ContainerInfo   `json:"containers"`
	Probes     []NodeProbeResult `json:"probes"`
}

type AgentResponse struct {
	OK           bool          `json:"ok"`
	IntervalSec  int           `json:"intervalSec"`
	ProbeTargets []ProbeTarget `json:"probeTargets"`
}
