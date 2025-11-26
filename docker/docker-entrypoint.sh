#!/bin/bash
# Custom entrypoint for SignalK test server with sample data

# Start SignalK server with sample NMEA data and override timestamps
exec /home/node/signalk/bin/signalk-server --sample-nmea0183-data --override-timestamps "$@"
