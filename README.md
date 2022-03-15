# Hardware diagnostics

Containerized application to check basic functions of your IOT hardware like
- leds
- drives
- network
- etc.

Http server published on port `3000` \
Check the `/api-docs` to see how each endpoint works.

Included specialized UI for EtcherPro testing at route `/diagsteps/start`

### use as repo
```yml
#...

services:  
  diagnostics:
    build: ./
    privileged: true # important for some operation
    network_mode: host
    labels:
      io.balena.features.dbus: 1
      io.balena.features.supervisor-api: '1'
    environment:
      - 'UDEV=1' # if you want to utilize udev 
 # ...
```
### from prebuild images
```yml
#...

services:  
  diagnostics:
    image: mcraa/hardware-diagnostics # :v0.0.3 or the tag you want, tags on git match the tags on docker hub
    privileged: true # important for some operation
    network_mode: host
    labels:
      io.balena.features.dbus: 1
      io.balena.features.supervisor-api: '1'
    environment:
      - 'UDEV=1' # if you want to utilize udev 
 # ...
```
