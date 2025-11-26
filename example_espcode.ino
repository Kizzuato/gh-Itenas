#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

// --- WIFI CONFIGURATION ---
const char* ssid = "WIFI_SSID";
const char* password = "WIFI_PASSWORD";
const char* mqtt_server = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.xx.xx.hivemq.cloud";
const int mqtt_port = 8883;

// ⚠️ CRITICAL: You must create these in your HiveMQ Cloud Access Management
const char* mqtt_user = "USERNAME"; 
const char* mqtt_pass = "HIVEMQ_PASSWORD";

// GREENHOUSE ID
const int gh_id = 1;

const char* topic = ("greenhouses/" + String(gh_id) + "/heartbeat").c_str();

WiFiClientSecure espClient;
PubSubClient client(espClient);

float dht_temp = 26.5;
float dht_hum = 65.2;
float water_temp = 22.4;
float turbidity = 3.0; 

void setup() {
  Serial.begin(115200);
  
  setup_wifi();

  espClient.setInsecure(); 
  client.setServer(mqtt_server, mqtt_port);
}

void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    
    String clientId = "ESP32Client-";
    clientId += String(random(0xffff), HEX);

    if (client.connect(clientId.c_str(), mqtt_user, mqtt_pass)) {
      Serial.println("connected");
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  //// CHANGE THIS PAYLOAD TO SENSOR DATA ////
  // --- Create JSON Payload from Variables ---
  String payload = "{";
  payload += "\"id\": \"1\","; 
  payload += "\"dht_temp\": " + String(dht_temp, 1) + ",";
  payload += "\"dht_hum\": " + String(dht_hum, 1) + ",";
  payload += "\"water_temp\": " + String(water_temp, 1) + ",";
  payload += "\"turbidity\": " + String(turbidity, 1);
  payload += "}";
  // --- Increment Variables for Simulation ---
  dht_temp += 0.5;
  dht_hum += 1.0;
  water_temp += 0.2;
  turbidity += 0.5;
  // Reset if values get too high to keep simulation realistic
  if (dht_temp > 35.0) dht_temp = 20.0;
  if (dht_hum > 99.0) dht_hum = 40.0;
  if (water_temp > 40.0) water_temp = 15.0;
  if (turbidity > 10.0) turbidity = 0.0;
  //// END OF PAYLOAD ////
  
  // Publish
  client.publish(topic, payload.c_str());
  Serial.print("Message sent: ");
  Serial.println(payload);
  
  delay(1000);
}