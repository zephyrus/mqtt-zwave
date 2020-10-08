# mqtt-zwave
MQTT integration for Z-Wave Z-Way Controller

## Docker Compose

```yml
version: '3'

services:
  zwave:
    image: 2mqtt/zwave:0.0.8

    restart: always

    environment:
      - MQTT_ID=zwave
      - MQTT_PATH=zwave
      - MQTT_HOST=mqtt://<ip address of mqtt broker>
      - MQTT_USERNAME=<mqtt username>
      - MQTT_PASSWORD=<mqtt password>
      - ZWAY_HOST=<ip address of zway controller>
      - ZWAY_USERNAME=<zway username>
      - ZWAY_PASSWORD=<zway password>
```