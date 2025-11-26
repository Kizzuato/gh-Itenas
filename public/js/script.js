// --- Configuration ---
const API_BASE = window.location.origin;
let MQTT_CONFIG = {
    topic_pattern: 'greenhouses/+/heartbeat',
    timeout_ms: 5000
};

// --- Tailwind Config ---
tailwind.config = {
    theme: {
        extend: {
            fontFamily: { sans: ['Inter', 'sans-serif'] },
            colors: {
                primary: {
                    50: '#f0fdf4', 100: '#dcfce7', 500: '#22c55e', 600: '#16a34a',
                }
            }
        }
    }
};

// --- MQTT Service ---
const mqttService = {
    client: null,
    lastSeen: {},
    checkInterval: null,

    connect: async () => {
        if (mqttService.client) return;

        try {
            const res = await fetch(`${API_BASE}/api/config`);
            const config = await res.json();
            
            const host = `wss://${config.mqtt.host}:${config.mqtt.port}/mqtt`;
            const options = {
                username: config.mqtt.username,
                password: config.mqtt.password,
            };

            console.log("Connecting to MQTT...");
            mqttService.client = mqtt.connect(host, options);

            mqttService.client.on('connect', () => {
                console.log("✅ MQTT Connected");
                mqttService.client.subscribe(MQTT_CONFIG.topic_pattern);
            });

            mqttService.client.on('message', (topic, message) => {
                const parts = topic.split('/');
                const ghId = parts[1];
    
                mqttService.lastSeen[ghId] = Date.now();
                mqttService.updateStatusUI(ghId, true);
                
                detailPage.updateStatusUIFromMqtt(ghId, true);
    
                try {
                    const payload = JSON.parse(message.toString());
                    
                    mqttService.updateHomeCardRealtime(ghId, payload);
    
                    sendRealtimeToServer(ghId, payload, payload.created_at || new Date().toISOString());
    
                    detailPage.handleRealtimeUpdate(ghId, payload);
                } catch (e) {
                    console.warn('MQTT payload error:', e);
                }
            });
    
            if (mqttService.checkInterval) clearInterval(mqttService.checkInterval);
            mqttService.checkInterval = setInterval(mqttService.watchdog, 1000);

        } catch (e) {
            console.error("Failed to init MQTT:", e);
        }
    },

    updateHomeCardRealtime: (ghId, payload) => {
        const els = {
            air: document.getElementById(`home-air-${ghId}`),
            hum: document.getElementById(`home-hum-${ghId}`),
            water: document.getElementById(`home-water-${ghId}`),
            turb: document.getElementById(`home-turb-${ghId}`)
        };
        
        const colorize = (el, val, type) => {
            if(!el) return;
            el.innerText = val + (type === 'hum' ? '%' : (type === 'turb' ? '' : '°C'));
            el.className = 'font-medium mt-1';
            const n = Number(val);
            if(isNaN(n)) return;

            if(type === 'air') {
                if(n < 18) el.classList.add('text-blue-500');
                else if(n <= 30) el.classList.add('text-green-600');
                else el.classList.add('text-red-500');
            } else if(type === 'hum') {
                if(n >= 40 && n <= 70) el.classList.add('text-green-600');
                else el.classList.add('text-yellow-500');
            } else if(type === 'water') {
                if(n < 20) el.classList.add('text-blue-500');
                else if(n <= 28) el.classList.add('text-green-600');
                else el.classList.add('text-red-500');
            } else if(type === 'turb') {
                if(n < 1) el.classList.add('text-green-600');
                else if(n <= 5) el.classList.add('text-yellow-500');
                else el.classList.add('text-red-500');
            }
        };

        if(payload.dht_temp != null) colorize(els.air, payload.dht_temp, 'air');
        if(payload.dht_hum != null) colorize(els.hum, payload.dht_hum, 'hum');
        if(payload.water_temp != null) colorize(els.water, payload.water_temp, 'water');
        if(payload.turbidity != null) colorize(els.turb, payload.turbidity, 'turb');

        ['air','hum','water','turb'].forEach(k => {
            const lastEl = document.getElementById(`home-${k}-last-${ghId}`);
            if(lastEl) lastEl.innerText = '';
        });
    },

    watchdog: () => {
        const now = Date.now();
        const statusElements = document.querySelectorAll('[id^="status-container-"]');
        statusElements.forEach(el => {
            const ghId = el.id.replace('status-container-', '');
            const last = mqttService.lastSeen[ghId] || 0;
            const isOnline = (now - last) < MQTT_CONFIG.timeout_ms;

            if (!isOnline) {
                mqttService.updateStatusUI(ghId, false);
                mqttService.setHomeCardOffline(ghId);
            }
        });

        if (detailPage.currentId) {
            const ghId = detailPage.currentId;
            const last = mqttService.lastSeen[ghId] || 0;
            const isOnline = (now - last) < MQTT_CONFIG.timeout_ms;

            if (!isOnline) {
                detailPage.updateStatusUIFromMqtt(ghId, false);
                detailPage.setDetailOffline();
            }
        }
    },

    setHomeCardOffline: (ghId) => {
        ['air','hum','water','turb'].forEach(k => {
            const el = document.getElementById(`home-${k}-${ghId}`);
            if(el) {
                el.innerText = '--';
                el.className = 'font-medium mt-1 text-gray-400';
            }
        });

        api.fetchLatestHistory(ghId).then(latest => {
            if (!latest) return;
            const tsLabel = latest.created_at ? dayjs(latest.created_at).format('DD MMM HH:mm') : '';
            
            const updateLast = (k, val, unit) => {
                const el = document.getElementById(`home-${k}-last-${ghId}`);
                if(el && val != null) el.innerText = `Last: ${Math.round(val*100)/100}${unit} (${tsLabel})`;
            };

            updateLast('air', latest.dht_temp, '°C');
            updateLast('hum', latest.dht_hum, '%');
            updateLast('water', latest.water_temp, '°C');
            updateLast('turb', latest.turbidity, '');
        });
    },

    updateStatusUI: (id, isOnline) => {
        const textEl = document.getElementById(`status-text-${id}`);
        const dotEl = document.getElementById(`status-dot-${id}`);
        const btnEl = document.getElementById(`reload-btn-${id}`);

        if (!textEl || !dotEl) return;

        if (isOnline) {
            textEl.innerText = 'Online';
            textEl.className = 'text-green-600';
            dotEl.className = 'w-2 h-2 rounded-full mr-1 bg-green-500';
            if(btnEl) btnEl.classList.add('hidden');
        } else {
            textEl.innerText = 'Offline';
            textEl.className = 'text-red-500';
            dotEl.className = 'w-2 h-2 rounded-full mr-1 bg-red-500';
            if(btnEl) btnEl.classList.remove('hidden');
        }
    },

    manualCheck: (id) => {
        const textEl = document.getElementById(`status-text-${id}`);
        const dotEl = document.getElementById(`status-dot-${id}`);
        if(textEl) textEl.innerText = 'Checking...';
        if(dotEl) dotEl.className = "w-2 h-2 rounded-full bg-gray-300 mr-1 animate-pulse";
    }
};

async function sendRealtimeToServer(ghId, payload, createdAt) {
    try {
        await fetch(`${API_BASE}/api/realtime/${ghId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dht_temp: payload.dht_temp,
                dht_hum: payload.dht_hum,
                turbidity: payload.turbidity,
                water_temp: payload.water_temp,
                created_at: createdAt
            })
        });
    } catch (err) { }
}

// --- API Helper ---
const api = {
    async fetchGreenhouses() {
        try {
            const res = await fetch(`${API_BASE}/api/greenhouses`);
            return res.ok ? await res.json() : [];
        } catch { return []; }
    },
    async fetchLatestHistory(id) {
        try {
            const res = await fetch(`${API_BASE}/api/greenhouses/history/latest?gh=${id}`);
            return res.ok ? await res.json() : null;
        } catch { return null; }
    },
    async fetchHistoryRange(id, dateFrom, dateTo) {
        try {
            const params = new URLSearchParams({ gh: id });
            if (dateFrom) params.append('date_from', dateFrom);
            if (dateTo) params.append('date_to', dateTo);
            const res = await fetch(`${API_BASE}/api/greenhouses/history?${params.toString()}`);
            return res.ok ? await res.json() : [];
        } catch { return []; }
    },
    async fetchRealtimeSnapshot(id) {
        try {
            const res = await fetch(`${API_BASE}/api/realtime/${id}`);
            return res.ok ? await res.json() : [];
        } catch { return []; }
    }
};

// --- Home Page ---
const homePage = {
    init: async () => {
        const grid = document.getElementById('greenhouse-grid');
        if (!grid) return;
        const greenhouses = await api.fetchGreenhouses();
        document.getElementById('home-loader').classList.add('hidden');
        if (!greenhouses.length) return document.getElementById('home-empty').classList.remove('hidden');

        for (const gh of greenhouses) {
            const card = document.createElement('a');
            card.href = `/greenhouse.html?id=${gh.id}`;
            card.className = "block bg-white rounded-xl p-6 shadow-sm hover:shadow-lg transition-all border border-gray-100 relative";
            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <div class="flex-1"><h3 class="text-lg font-bold text-gray-800">${gh.name}</h3></div>
                    <div class="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400"><i class="ph-fill ph-plant text-xl"></i></div>
                </div>
                <div class="mb-4 flex items-center gap-2" id="status-container-${gh.id}">
                     <div class="text-xs flex items-center"><div id="status-dot-${gh.id}" class="w-2 h-2 rounded-full bg-gray-300 mr-1"></div><span id="status-text-${gh.id}" class="text-gray-400">Waiting...</span></div>
                    <button type="button" onclick="event.preventDefault();mqttService.manualCheck('${gh.id}')" id="reload-btn-${gh.id}" class="hidden text-xs bg-gray-100 px-2 py-1 rounded border">Check</button>
                </div>
                <div class="grid grid-cols-2 gap-y-4 gap-x-2 text-sm text-gray-600 group">
                    <div class="p-2 bg-gray-50 rounded-lg"><div class="flex items-center gap-2"><i class="ph ph-thermometer text-red-400"></i><span class="text-xs">Air</span></div><span id="home-air-${gh.id}" class="font-medium mt-1">--</span><span id="home-air-last-${gh.id}" class="text-[11px] block text-gray-400"></span></div>
                    <div class="p-2 bg-gray-50 rounded-lg"><div class="flex items-center gap-2"><i class="ph ph-drop text-blue-400"></i><span class="text-xs">Hum</span></div><span id="home-hum-${gh.id}" class="font-medium mt-1">--</span><span id="home-hum-last-${gh.id}" class="text-[11px] block text-gray-400"></span></div>
                    <div class="p-2 bg-gray-50 rounded-lg"><div class="flex items-center gap-2"><i class="ph ph-wave-sine text-indigo-400"></i><span class="text-xs">Turb</span></div><span id="home-turb-${gh.id}" class="font-medium mt-1">--</span><span id="home-turb-last-${gh.id}" class="text-[11px] block text-gray-400"></span></div>
                    <div class="p-2 bg-gray-50 rounded-lg"><div class="flex items-center gap-2"><i class="ph ph-thermometer-simple text-cyan-400"></i><span class="text-xs">Water</span></div><span id="home-water-${gh.id}" class="font-medium mt-1">--</span><span id="home-water-last-${gh.id}" class="text-[11px] block text-gray-400"></span></div>
                </div>
            `;
            grid.appendChild(card);
            homePage.updateCardData(gh.id);
        }
        mqttService.connect();
    },
    updateCardData: async (id) => {
        const latest = await api.fetchLatestHistory(id);
        if(latest) mqttService.setHomeCardOffline(id);
    }
};

// --- Detail Page ---
// --- Detail Page ---
const detailPage = {
    chart: null, humidityChart: null, waterChart: null, turbidityChart: null,
    currentId: null,

    isRealtimeMode: false,
    realtimeBuffer: [],
    lastChartUpdate: 0,

    init: async () => {
        const params = new URLSearchParams(window.location.search);
        detailPage.currentId = params.get('id');
        if (!detailPage.currentId || !document.getElementById('detail-content')) return;

        const greenhouses = await api.fetchGreenhouses();
        const gh = greenhouses.find(g => g.id == detailPage.currentId);
        if(gh) document.getElementById('detail-title').innerText = gh.name;

        // --- Filter Event Listeners ---
        const rangeSelect = document.getElementById('range-select');
        const dateFromInput = document.getElementById('date-from');
        const dateToInput = document.getElementById('date-to');

        if (rangeSelect) {
            rangeSelect.addEventListener('change', function() {
                const val = this.value;
                
                if (val === 'realtime') {
                    detailPage.isRealtimeMode = true;
                    if(dateFromInput) dateFromInput.value = '';
                    if(dateToInput) dateToInput.value = '';
                    detailPage.loadRealtimeData(); 
                } else {
                    detailPage.isRealtimeMode = false;
                    if (!val) return;
                    
                    const now = dayjs();
                    const dateFormat = 'YYYY-MM-DD';
                    if(dateToInput) dateToInput.value = now.format(dateFormat);

                    let fromDate;
                    if (val === 'daily') fromDate = now.subtract(1, 'day');
                    else if (val === 'weekly') fromDate = now.subtract(7, 'day');
                    else if (val === 'monthly') fromDate = now.subtract(30, 'day');

                    if (fromDate && dateFromInput) {
                        dateFromInput.value = fromDate.format(dateFormat);
                    }
                    detailPage.loadHistory();
                }
            });
        }

        const handleManualChange = () => {
            if (rangeSelect) rangeSelect.value = ""; 
            detailPage.isRealtimeMode = false;
            detailPage.loadHistory();
        };

        if(dateFromInput) dateFromInput.addEventListener('change', handleManualChange);
        if(dateToInput) dateToInput.addEventListener('change', handleManualChange);

        // --- Set Default to Realtime on Load ---
        if (rangeSelect) {
            rangeSelect.value = 'realtime';
            rangeSelect.dispatchEvent(new Event('change'));
        }

        const latest = await api.fetchLatestHistory(detailPage.currentId);
        if(latest) detailPage.updateDetailValues(latest);
    },

    loadRealtimeData: async () => {
        const id = detailPage.currentId;
        // 1. Fetch data from DB
        const data = await api.fetchRealtimeSnapshot(id);

        console.log("Realtime Snapshot from Server:", data);
        
        if (data && data.length > 0) {
            // 2. Sort Oldest -> Newest (Crucial for Line Charts)
            const sortedData = data.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

            // 3. Take only the last 20 items for the buffer
            detailPage.realtimeBuffer = sortedData.slice(-20);

            detailPage.renderRealtimeCharts();
            document.getElementById('detail-content').classList.remove('hidden');
            document.getElementById('detail-empty').classList.add('hidden');
        } else {
            // Start with empty buffer if no DB data exists
            detailPage.realtimeBuffer = [];
            document.getElementById('detail-content').classList.add('hidden');
            document.getElementById('detail-empty').classList.remove('hidden');
        }
    },

    handleRealtimeUpdate: (ghId, payload) => {
        // Update big number cards regardless of mode
        if (detailPage.currentId == ghId) {
            detailPage.updateDetailValues(payload);
        }

        // Only update chart if we are in Realtime Mode
        if (detailPage.isRealtimeMode && detailPage.currentId == ghId) {
            const now = Date.now();
            
            // Optional: Throttle updates (e.g., every 2 seconds) to prevent UI lag if MQTT is spamming
            // Remove this if check if you want every single packet instantly
            if (now - detailPage.lastChartUpdate > 2000) {
                
                const newPoint = {
                    ...payload,
                    // Ensure we have a timestamp. MQTT payload might not have it, so use current time.
                    created_at: payload.created_at || new Date().toISOString()
                };

                // 4. Push new data to the buffer
                detailPage.realtimeBuffer.push(newPoint);

                // 5. Maintain max 20 items in buffer (Remove oldest)
                if (detailPage.realtimeBuffer.length > 20) {
                    detailPage.realtimeBuffer.shift(); 
                }

                detailPage.lastChartUpdate = now;
                detailPage.renderRealtimeCharts();

                // Ensure UI is visible now that we have data
                if (detailPage.realtimeBuffer.length > 0) {
                    document.getElementById('detail-content').classList.remove('hidden');
                    document.getElementById('detail-empty').classList.add('hidden');
                }
            }
        }
    },

    renderRealtimeCharts: () => {
        // Render whatever is currently in the buffer
        detailPage.renderCharts(detailPage.realtimeBuffer);
    },

    loadHistory: async () => {
        const id = detailPage.currentId;
        const dateFromInput = document.getElementById('date-from');
        const dateToInput = document.getElementById('date-to');

        let dateFrom = dateFromInput ? dateFromInput.value : null;
        let dateTo = dateToInput ? dateToInput.value : null;

        if (dateTo && dateTo.length === 10) {
            dateTo = dateTo + ' 23:59:59';
        }

        const data = await api.fetchHistoryRange(id, dateFrom, dateTo);

        if (!data || !data.length) {
            document.getElementById('detail-empty').classList.remove('hidden');
            document.getElementById('detail-content').classList.add('hidden');
            return;
        }

        document.getElementById('detail-content').classList.remove('hidden');
        document.getElementById('detail-empty').classList.add('hidden');

        const sorted = data.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));

        detailPage.renderCharts(sorted);
    },

    updateDetailValues: (val) => {
        const els = {
            air: document.getElementById('val-air'),
            hum: document.getElementById('val-humidity'),
            water: document.getElementById('val-water'),
            turb: document.getElementById('val-turbidity')
        };
        
        ['air','hum','water','turb'].forEach(k => {
            const el = document.getElementById(`detail-last-${k}`);
            if(el) el.innerText = '';
        });

        const colorize = (el, v, type) => {
            if(!el) return;
            el.innerText = Math.round(v*100)/100;
            el.className = '';
            const n = Number(v);
            
            if(type === 'air') {
                if(n < 18) el.classList.add('text-blue-500');
                else if(n <= 30) el.classList.add('text-green-600');
                else el.classList.add('text-red-500');
            } else if(type === 'hum') {
                if(n >= 40 && n <= 70) el.classList.add('text-green-600');
                else el.classList.add('text-yellow-500');
            } else if(type === 'water') {
                if(n < 20) el.classList.add('text-blue-500');
                else if(n <= 28) el.classList.add('text-green-600');
                else el.classList.add('text-red-500');
            } else if(type === 'turb') {
                if(n < 1) el.classList.add('text-green-600');
                else if(n <= 5) el.classList.add('text-yellow-500');
                else el.classList.add('text-red-500');
            }
        };

        if(val.dht_temp != null) colorize(els.air, val.dht_temp, 'air');
        if(val.dht_hum != null) colorize(els.hum, val.dht_hum, 'hum');
        if(val.water_temp != null) colorize(els.water, val.water_temp, 'water');
        if(val.turbidity != null) colorize(els.turb, val.turbidity, 'turb');
    },

    setDetailOffline: () => {
        ['val-air', 'val-humidity', 'val-water', 'val-turbidity'].forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                el.innerText = '--';
                el.className = 'text-gray-400';
            }
        });

        api.fetchLatestHistory(detailPage.currentId).then(latest => {
            if(!latest) return;
            const ts = latest.created_at ? dayjs(latest.created_at).format('DD MMM HH:mm') : '';
            
            const fillLast = (key, val, unit) => {
                const el = document.getElementById(`detail-last-${key}`);
                if(el && val != null) {
                    el.innerText = `Last: ${Math.round(val*100)/100}${unit} (${ts})`;
                }
            };

            fillLast('air', latest.dht_temp, '°C');
            fillLast('hum', latest.dht_hum, '%');
            fillLast('water', latest.water_temp, '°C');
            fillLast('turb', latest.turbidity, '');
        });
    },

    updateStatusUIFromMqtt: (ghId, isOnline) => {
        const textEl = document.getElementById('detail-status-text');
        const dotEl = document.getElementById('detail-status-dot');
        if (!textEl || !dotEl) return;

        if (isOnline) {
            textEl.innerText = 'Online';
            textEl.className = 'text-green-600 font-medium';
            dotEl.className = 'w-2.5 h-2.5 rounded-full bg-green-500';
        } else {
            textEl.innerText = 'Offline';
            textEl.className = 'text-red-500 font-medium';
            dotEl.className = 'w-2.5 h-2.5 rounded-full bg-red-500';
        }
    },

    renderCharts: (data) => {
        if (!data || data.length === 0) return;

        const startTime = dayjs(data[0].created_at);
        const endTime = dayjs(data[data.length - 1].created_at);
        const durationInHours = endTime.diff(startTime, 'hour');
        const isDailyView = durationInHours > 24;

        const isRealtime = detailPage.isRealtimeMode;

        const axisFormat = isRealtime ? 'HH:mm:ss' : (isDailyView ? 'DD MMM' : 'HH:mm'); 
        const tooltipFormat = isRealtime ? 'HH:mm:ss' : (isDailyView ? 'DD MMMM YYYY' : 'DD MMM HH:mm');

        const labels = data.map(d => dayjs(d.created_at).format(axisFormat));

        const createChart = (ctxId, ref, label, dataArr, color, bg) => {
            const ctx = document.getElementById(ctxId);
            if(!ctx) return;
            
            if(detailPage[ref]) detailPage[ref].destroy();

            detailPage[ref] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label, data: dataArr,
                        borderColor: color, backgroundColor: bg,
                        fill: true, tension: 0.4, 
                        pointRadius: isDailyView ? 4 : 2,
                        pointHoverRadius: 6
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    
                    animation: isRealtime ? false : { duration: 1000 }, 
                    interaction: { mode: 'index', intersect: false },
                    plugins: { 
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                title: (context) => {
                                    const index = context[0].dataIndex;
                                    const dateObj = data[index].created_at;
                                    return dayjs(dateObj).format(tooltipFormat);
                                }
                            }
                        }
                    },
                    scales: { 
                        x: { 
                            display: true, 
                            grid: { display: false },
                            ticks: {
                                maxTicksLimit: 8,
                                maxRotation: 0,
                                autoSkip: true
                            }
                        } 
                    }
                }
            });
        };

        createChart('airTempChart', 'chart', 'Air Temp', data.map(d=>d.dht_temp), '#22c55e', 'rgba(34, 197, 94, 0.1)');
        createChart('humidityChart', 'humidityChart', 'Humidity', data.map(d=>d.dht_hum), '#0ea5e9', 'rgba(14, 165, 233, 0.1)');
        createChart('waterTempChart', 'waterChart', 'Water Temp', data.map(d=>d.water_temp), '#6366f1', 'rgba(99, 102, 241, 0.1)');
        createChart('turbidityChart', 'turbidityChart', 'Turbidity', data.map(d=>d.turbidity), '#f97316', 'rgba(249, 115, 22, 0.1)');
    }
};

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('greenhouse-grid')) homePage.init();
    else if (document.getElementById('detail-content')) {
        detailPage.init();
        mqttService.connect();
    }
});
