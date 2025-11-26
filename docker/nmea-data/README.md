# Custom NMEA Data for Testing

This directory can contain custom NMEA data files for testing specific scenarios.

## Example NMEA0183 Sentences

```
$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47
$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A
$GPVTG,084.4,T,070.3,M,022.4,N,041.5,K*48
$IIMWV,084,R,10.4,N,A*2C
$IIDBT,9.3,f,2.8,M,1.5,F*14
$IIVHW,084,T,070,M,22.4,N,41.5,K*5A
```

## Usage

To use custom NMEA data, you would need to:

1. Create a file with NMEA sentences (one per line)
2. Mount it into the container
3. Configure a file-based NMEA provider in SignalK

This is reserved for future enhancement when more complex test scenarios are needed.
