import { useEffect, useRef, useState } from 'react';
import { Box, Button, HighlightedName, Table, Txt, Flex, ButtonGroup, } from 'rendition'
import { ProgressButton } from '../components/progress-button/progress-button';
import { FioResult, ReadOrWriteOrTrim } from '../iterfaces/FioResult';
import { LedService } from '../services/Leds'

import { faRecycle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type DrivesPageProps = {
  onDataReceived?: (data: any) => void
  onBack?: () => void,
  onNext?: () => void,
  autoload?: boolean
}

type FioResultDict = {
  name: string,
  data: ReadOrWriteOrTrim
}

type DrivesListItem = {
  path: string //--> from /dev/disk/by-path/* (no path at the beginning)
  device: string //--> sd[.] (no /dev at the beginning)
}

type DriveLeds = {
  [index: string]: string[]
}

type ToggleLeds = {
  [index: string]: boolean
}

export const Drives = ({ autoload, onDataReceived, onBack, onNext }: DrivesPageProps) => {
  const [drives, setDrives] = useState([] as Array<DrivesListItem>);
  const [fioResults, setFioResults] = useState<FioResultDict[]>([]);
  const [driveLeds, setDriveLeds] = useState<DriveLeds>({});
  const [toggleLeds, setToggleLeds] = useState<ToggleLeds>({});
  const [fioOneByOneProgress, setFioOneByOneProgress] = useState<number>(0)
  const [fioAllProgress, setFioAllProgress] = useState<number>(0)
  const [fioCallOneByOneInProgress, setFioCallOnebyOneInProgress] = useState<boolean>(false)
  const [fioCallAllInProgress, setFioCallAllInProgress] = useState<boolean>(false)  
  const [canceled, setCanceled] = useState(false);
  const [driveUnderTestIndex, setDriveUnderTestIndex] = useState<number>(0);
  const [sdkNotFio, setSdkNotFio] = useState(true);
  const [disabledDrives, setDisabledDrives] = useState<number[]>([])

  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.hostname}:7071`)
    ws.onopen = (event) => {
      ws.send("Connected to drives test progress socket");
    };

    ws.onmessage = async (event) => {
      if (event.data === 'cancel') {
        ws.send("Cancel received")
        return;
      }
      
      if (event.data === 'done') {
        await processWsDoneMessage(ws);
      } else if (event.data === 'done sdk') {
        await processWsDoneSdkMessage(ws);
      }     
    };

    return () => ws.close();
  }, []);

  useEffect(() => {
    if (fioCallAllInProgress) {
      setFioAllProgress(100);
  
      if (onDataReceived) {
        onDataReceived({ devices: drives, results: fioResults })
      }

      setFioCallAllInProgress(false);
    }

    if (fioCallOneByOneInProgress) {
      if (!canceled) {
        if (driveUnderTestIndex < drives.length - 1) {
          setFioOneByOneProgress(Math.round((driveUnderTestIndex + 1) / drives.length * 100))
          callFioOneByOne(driveUnderTestIndex + 1);
        } else {
          setFioOneByOneProgress(100);

          if (onDataReceived) {
            onDataReceived({ devices: drives, results: fioResults })
          }

          setFioCallOnebyOneInProgress(false);
        }
      } 
    }
  }, [fioResults])

  const processWsDoneMessage = async (ws: WebSocket) => {
    let fioRes = await fetch('/api/drives/fio/last')
    const lastRes = parseFioResultToDict(await fioRes.json())      

    setFioResults(prevState => [...prevState, lastRes])
  }

  const processWsDoneSdkMessage = async (ws: WebSocket) => {
    let sdkRes = await fetch('/api/drives/sdk/last')
    const lastRes = parseSdkResultToDict((await sdkRes.text()).split('=>'))      

    setFioResults(prevState => [...prevState, lastRes])
  }

  useEffect(() => {
    if (autoload) {
      (async () => {
        await getDrives()
        await getDriveLeds()
      })()
    }
  }, [autoload])

  const useInterval = (callback: Function, delay?: number) => {
    const savedCallback = useRef<Function>();
  
    // Remember the latest callback.
    useEffect(() => {
      savedCallback.current = callback;
    }, [callback]);
  
    // Set up the interval.
    useEffect(() => {
      function tick() {
        if (savedCallback && savedCallback.current) {
          savedCallback.current();
        }
      }
      if (delay !== undefined) {
        let id = setInterval(tick, delay);
        return () => clearInterval(id);
      }
    }, [delay]);
  }

  useInterval(() => {
    setFioAllProgress(prevState => { 
      const newState = prevState + parseFloat((Math.round(Math.random() * 99) / ((sdkNotFio ? (drives.length / 1.4) : 5) * 10)).toFixed(2))
      return newState > 99 ? 99 : newState
    })
  }, fioCallAllInProgress ? 500 : undefined)

  useInterval(() => {
    setFioOneByOneProgress(prevState => { 
      const newState = prevState + parseFloat((Math.round(Math.random() * 60) / (drives.length * 10)).toFixed(2))
      return newState > 99 ? 99 : newState
    })
  }, fioCallOneByOneInProgress ? 900 : undefined)

  const getDrives = async () => {
    try {
      const res = await fetch(`/api/drives`)
      const drivesResponse = await res.json()
      setDrives(drivesResponse);
      setDisabledDrives([])
      if (onDataReceived) {
        onDataReceived({ devices: drivesResponse })
      }
    } catch (err) {
      console.log("Cant get drives", err)
    }
  } 

  const getDriveLeds = async () => {
    const res = await fetch(`/api/supervisor/etcher-config`)
    const configResponse = await res.json()
    setDriveLeds(configResponse['ledsMapping']);
  }

  const parseFioResultToDict = (input: FioResult) => {
    return { 
      name: input["global options"].filename,
      data: input.jobs[0].write
    }
  }

  const parseSdkResultToDict = (input: string[]) => {
    const inputData = JSON.parse(input[1].trim())
    return { 
      name: input[0].trim(),
      data: { 
        bw: inputData.speed / 1000,
        bw_mean: inputData.averageSpeed / 1000,
        bw_min: 0,
        bw_max: 0
      } as ReadOrWriteOrTrim
    }
  }

  const cancelRun = async () => {
    try {
      const res = await fetch(`/api/drives/cancel`);
      if (res.ok) {
        setFioCallAllInProgress(false);
        setFioCallOnebyOneInProgress(false);
        setCanceled(true);
      }
    } catch (error) {
      console.log(error)
    }
    
  }
  
  const callFioRunAll = async () => {
    setFioResults([]);
    setFioAllProgress(1);

    try {
      let devices = drives.map(d => `/dev/${d.device}`)
      const url = `/api/drives/${sdkNotFio ? 'sdk' : 'fio'}`

      const fioStart = await fetch(url, { 
        method: 'POST',
        body: JSON.stringify({ devices: devices }),
        headers: { 'Content-Type': 'application/json' },
      })
      
      if (fioStart.ok) {
        setFioCallAllInProgress(true)        
      } 
    } catch (error) {
      // TODO cancel?
    }
  }

  const callFioOneByOne = async (driveIndex: number) => {    
    if (driveIndex === 0) {
      setCanceled(false)
      setFioResults([])
      setFioOneByOneProgress(1);
    }
    
    if (disabledDrives.indexOf(driveIndex) > -1) {
      if (driveIndex === drives.length - 1) {
        setFioCallOnebyOneInProgress(false)
        return;
      }
      callFioOneByOne(driveIndex + 1);
      return;
    }

    setDriveUnderTestIndex(driveIndex);
    const url = `/api/drives/${sdkNotFio ? 'sdk' : 'fio'}`
    const fioRes = await fetch(url, { 
      method: 'POST',
      body: JSON.stringify({ devices: [`/dev/${drives[driveIndex].device}`] }),
      headers: { 'Content-Type': 'application/json' },
    })
        
    if (fioRes.ok) {        
      setFioCallOnebyOneInProgress(true)        
    }
  }

  const handleResultClick = async (device: string) => {
    if (!device.length) return;
    device = device.replace(/\/dev\//,'');

    let driveIndex = drives.findIndex(d => d.device === device)

    if (driveIndex > -1) {
      await toggleLed(drives[driveIndex].path, 'blue')
    } else {
      console.error(`device: ${device} mapping cannot be resolved`)
    }
  }

  const toggleLed = async (drivePath: string, color?: 'red' | 'green' | 'blue') => {
    const leds = {
      red: driveLeds[drivePath][0], // led.*_r
      green: driveLeds[drivePath][1], // led.*_g
      blue: driveLeds[drivePath][2] // led.*_b
    } 
    
    // reset
    await LedService.callOneLed(leds['red'], "0")
    await LedService.callOneLed(leds['green'], "0")
    await LedService.callOneLed(leds['blue'], "0")

    if (toggleLeds[drivePath]) {
      setToggleLeds(prevState => { return { ...prevState, [drivePath]: false } })
    } else {
      setToggleLeds(prevState => { return { ...prevState, [drivePath]: true } })
      await LedService.callOneLed(color ? leds[color] : leds['blue'], "99")
    }
  }

  const getSlotNumberByLed = (device: string) => {
    if (!device.length) return;
    if (device.indexOf(":") > -1) return `1 to ${drives.length}`

    device = device.replace(/\/dev\//,''); // remove '/dev/' if any
    let driveIndex = drives.findIndex(d => d.device === device)

    if (driveIndex > -1) {
      let driveName = drives[driveIndex].path
      let ledOne = driveLeds ? driveLeds[driveName] ? driveLeds[driveName][0] : '' : '' // led.*_r
      const numberPattern = /\d+/g;
      return ledOne.match(numberPattern)?.join('')
    }
  }

  const toggleDisableDrive = async (i: number, devicePath: string) => {
    await toggleLed(devicePath, 'red')
    const index = disabledDrives.indexOf(i)
    if (index > -1) {
      const temp = [...disabledDrives]
      temp.splice(index, 1); 
      setDisabledDrives(temp);
    } else {
      setDisabledDrives([...disabledDrives, i])
    }
  }

  return (
    <>
      
      <Box style={{overflowY: 'auto', height: '100%', paddingTop: '10px'}}>
        <Flex 
          alignItems={'center'}
          justifyContent={'center'}
          paddingBottom={'10px'}
        >      
          <Box width={'210px'}>
            <Box style={{textAlign: 'left', padding: '10px 0 0 10px '}}>
              <Button
                icon={<FontAwesomeIcon icon={faRecycle} />}
                plain
                onClick={() => getDrives()}
              >
                <HighlightedName>{drives.length +' drives connected'}
                </HighlightedName>
              </Button>
            </Box>
          </Box>  
          <Box>
            &nbsp;
            
            &nbsp;
          </Box>
          <Box width={'210px'}>
            <ProgressButton  
              type='flashing'
              progressText='Writing...'
              active={fioCallOneByOneInProgress}
              percentage={fioOneByOneProgress}
              position={fioOneByOneProgress}
              decimals={2}
              disabled={false}
              cancel={()=> cancelRun()}
              warning={false}
              callback={() => callFioOneByOne(0)}
              text={`Flash ${drives.length - disabledDrives.length} drives`}
            /> 
          </Box>          
        </Flex>  

        <Flex
          alignItems={'center'}
          justifyContent={'center'}
          paddingBottom={'10px'}
        >
          <ButtonGroup>
            <>
              {drives.map((d, i) => 
                <Button 
                  size='small'
                  primary={disabledDrives.indexOf(i) === -1}
                  onClick={() => toggleDisableDrive(i, d.path)}
                >
                  {getSlotNumberByLed(d.device)}
                </Button>
              )}
            </>
          </ButtonGroup>
        </Flex>
        
        <Table
          onRowClick={(row) => handleResultClick(row.name)}
          rowKey='name'
          columns={[
            {
              field: 'name',
              label: 'Drive number',
              render: (value) => <Txt bold>{ getSlotNumberByLed(value) }</Txt>
            },
            {                        
              field: 'data',
              key: 'avg',
              label: 'Average',
              render: (value) => <Txt bold>{`${(value.bw_mean/1000).toFixed(2)} MB/s`}</Txt>
            },
            {
              field: 'data',
              key: 'max',
              label: 'Max',
              render: (value) => sdkNotFio ? `-` : `${(value.bw_max/1000).toFixed(2)} MB/s`
            },
            {
              field: 'data',
              key: 'min',
              label: 'Min', 
              render: (value) => sdkNotFio ? `-` : `${(value.bw_min/1000).toFixed(2)} MB/s`
            },
            {
              field: 'data',
              key: 'bw',
              label: 'Bandwith',
              render: (value) => `${(value.bw/1000).toFixed(2)} MB/s`
            },
          ]}
          data={fioResults}
        />
      </Box>
      <Flex 
          alignItems={'flex-end'} 
          justifyContent={'center'}
          style={{padding: '15px 0 30px 0', marginBottom: '7px' }}
      >
        <Button outline onClick={() => onBack ? onBack() : null }>Back</Button>
         &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; 
        <Button primary onClick={() => onNext ? onNext() : null }>Next</Button>
      </Flex>
    </>
  );
};