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

// SparkPoint encodes [tsMs, cpuPct, rxBytesPerSec, txBytesPerSec]
type SparkPoint [4]any

type NodeDto struct {
	ID              string            `json:"id"`
	Name            string            `json:"name"`
	TokenHint       string            `json:"tokenHint"`
	Region          string            `json:"region"`
	Flag            string            `json:"flag"`
	Provider        string            `json:"provider"`
	Tags            []string          `json:"tags"`
	SortOrder       int               `json:"sortOrder"`
	Online          bool              `json:"online"`
	LastSeenAt      int64             `json:"lastSeenAt"`
	Uptime          int64             `json:"uptime"`
	IP              string            `json:"ip"`
	IPv6            string            `json:"ipv6"`
	OS              string            `json:"os"`
	Arch            string            `json:"arch"`
	Kernel          string            `json:"kernel"`
	AgentVersion    string            `json:"agentVersion,omitempty"`
	NetIface        string            `json:"netIface,omitempty"`
	CPUModel        string            `json:"cpuModel"`
	CPUCores        int               `json:"cpuCores"`
	MemTotal        int64             `json:"memTotal"`
	SwapTotal       int64             `json:"swapTotal"`
	DiskTotal       int64             `json:"diskTotal"`
	CPUUsage        float64           `json:"cpuUsage"`
	Load1           float64           `json:"load1"`
	Load5           float64           `json:"load5"`
	Load15          float64           `json:"load15"`
	MemUsed         int64             `json:"memUsed"`
	SwapUsed        int64             `json:"swapUsed"`
	DiskUsed        int64             `json:"diskUsed"`
	NetRxSpeed      float64           `json:"netRxSpeed"`
	NetTxSpeed      float64           `json:"netTxSpeed"`
	NetRxTotal      int64             `json:"netRxTotal"`
	NetTxTotal      int64             `json:"netTxTotal"`
	TCPConns        int               `json:"tcpConns"`
	ProcCount       int               `json:"procCount"`
	Containers      []ContainerInfo   `json:"containers"`
	NodeProbes      []NodeProbeResult `json:"nodeProbes"`
	Sparkline       []SparkPoint      `json:"sparkline"`
	TrafficLimitGb  float64           `json:"trafficLimitGb"`
	TrafficMode     string            `json:"trafficMode"`
	TrafficUnitBase int               `json:"trafficUnitBase"`
	TrafficResetDay int               `json:"trafficResetDay"`
	TrafficCycleKey string            `json:"trafficCycleKey"`
	TrafficRxCycle  int64             `json:"trafficRxCycle"`
	TrafficTxCycle  int64             `json:"trafficTxCycle"`
	TrafficUsedByte int64             `json:"trafficUsedBytes"`
	Price           float64           `json:"price"`
	Currency        string            `json:"currency"`
	BillingCycle    string            `json:"billingCycle"`
	PurchaseDate    string            `json:"purchaseDate"`
	ExpireDate      string            `json:"expireDate"`
	AutoRenew       bool              `json:"autoRenew"`
	RenewURL        string            `json:"renewUrl,omitempty"`
	Notes           string            `json:"notes"`
}

type NodeUpsertPayload struct {
	Name            *string   `json:"name"`
	Region          *string   `json:"region"`
	Flag            *string   `json:"flag"`
	Provider        *string   `json:"provider"`
	Tags            *[]string `json:"tags"`
	SortOrder       *int      `json:"sortOrder"`
	TrafficLimitGb  *float64  `json:"trafficLimitGb"`
	TrafficMode     *string   `json:"trafficMode"`
	TrafficUnitBase *int      `json:"trafficUnitBase"`
	TrafficResetDay *int      `json:"trafficResetDay"`
	CalibrateRxGb   *float64  `json:"calibrateRxGb"`
	CalibrateTxGb   *float64  `json:"calibrateTxGb"`
	Price           *float64  `json:"price"`
	Currency        *string   `json:"currency"`
	BillingCycle    *string   `json:"billingCycle"`
	PurchaseDate    *string   `json:"purchaseDate"`
	ExpireDate      *string   `json:"expireDate"`
	AutoRenew       *bool     `json:"autoRenew"`
	RenewURL        *string   `json:"renewUrl"`
	Notes           *string   `json:"notes"`
}

type ProbeSummary struct {
	CTMs   *float64 `json:"ctMs,omitempty"`
	CUMs   *float64 `json:"cuMs,omitempty"`
	CMMs   *float64 `json:"cmMs,omitempty"`
	CTLoss *float64 `json:"ctLoss,omitempty"`
	CULoss *float64 `json:"cuLoss,omitempty"`
	CMLoss *float64 `json:"cmLoss,omitempty"`
}

type HistoryPoint struct {
	Ts      int64         `json:"ts"`
	CPU     float64       `json:"cpu"`
	MemPct  float64       `json:"memPct"`
	SwapPct float64       `json:"swapPct"`
	DiskPct float64       `json:"diskPct"`
	Load1   float64       `json:"load1"`
	RxSpeed float64       `json:"rxSpeed"`
	TxSpeed float64       `json:"txSpeed"`
	Probes  *ProbeSummary `json:"probes,omitempty"`
}

type ProbeTargetDto struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Type           string `json:"type"`
	Target         string `json:"target"`
	ExpectedStatus int    `json:"expectedStatus"`
	Enabled        bool   `json:"enabled"`
}

type EdgeProbeRecord struct {
	Ts         int64  `json:"ts"`
	OK         bool   `json:"ok"`
	StatusCode int    `json:"statusCode"`
	LatencyMs  int64  `json:"latencyMs"`
	Error      string `json:"error,omitempty"`
}

type AlertConfig struct {
	Enabled         bool   `json:"enabled"`
	Channel         string `json:"channel"` // telegram | feishu | webhook
	WebhookURL      string `json:"webhookUrl"`
	TelegramToken   string `json:"telegramToken"`
	TelegramChatID  string `json:"telegramChatId"`
	TrafficWarnPct  int    `json:"trafficWarnPct"`
	ExpireWarnDays  int    `json:"expireWarnDays"`
	NotifyOffline   bool   `json:"notifyOffline"`
	NotifyEdgeDown  bool   `json:"notifyEdgeDown"`
}

type SettingsDto struct {
	SiteTitle       string       `json:"siteTitle"`
	SiteDomain      string       `json:"siteDomain"`
	PublicAccess    string       `json:"publicAccess"`
	DisplayCurrency string       `json:"displayCurrency"`
	Alerts          *AlertConfig `json:"alerts,omitempty"`
}

type BootstrapResponse struct {
	Settings         SettingsDto                  `json:"settings"`
	Authenticated    bool                         `json:"authenticated"`
	RequiresAuth     bool                         `json:"requiresAuth,omitempty"`
	ServerTime       int64                        `json:"serverTime"`
	ServerMode       string                       `json:"serverMode,omitempty"`
	Nodes            []NodeDto                    `json:"nodes"`
	ProbeTargets     []ProbeTargetDto             `json:"probeTargets"`
	EdgeProbeHistory map[string][]EdgeProbeRecord `json:"edgeProbeHistory"`
}

type AgentReportPayload struct {
	IP           string            `json:"ip,omitempty"`
	IPv6         string            `json:"ipv6,omitempty"`
	OS           string            `json:"os"`
	Arch         string            `json:"arch"`
	Kernel       string            `json:"kernel"`
	AgentVersion string            `json:"agentVersion,omitempty"`
	NetIface     string            `json:"netIface,omitempty"`
	CPUModel     string            `json:"cpuModel"`
	CPUCores     int               `json:"cpuCores"`
	MemTotal     int64             `json:"memTotal"`
	SwapTotal    int64             `json:"swapTotal"`
	DiskTotal    int64             `json:"diskTotal"`
	Uptime       int64             `json:"uptime"`
	CPUUsage     float64           `json:"cpuUsage"`
	Load1        float64           `json:"load1"`
	Load5        float64           `json:"load5"`
	Load15       float64           `json:"load15"`
	MemUsed      int64             `json:"memUsed"`
	SwapUsed     int64             `json:"swapUsed"`
	DiskUsed     int64             `json:"diskUsed"`
	NetRxSpeed   float64           `json:"netRxSpeed"`
	NetTxSpeed   float64           `json:"netTxSpeed"`
	NetRxTotal   int64             `json:"netRxTotal"`
	NetTxTotal   int64             `json:"netTxTotal"`
	TCPConns     int               `json:"tcpConns"`
	ProcCount    int               `json:"procCount"`
	Containers   []ContainerInfo   `json:"containers"`
	Probes       []NodeProbeResult `json:"probes"`
}
