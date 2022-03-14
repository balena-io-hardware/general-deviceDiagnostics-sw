import { useEffect, useRef, useState } from 'react';
import { Box, Button, Checkbox, HighlightedName, Table, Txt, Flex } from 'rendition'
import { ProgressButton } from '../components/progress-button/progress-button';
import { FioResult, ReadOrWriteOrTrim } from '../iterfaces/FioResult';
import { LedService } from '../services/Leds'

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
  const [sdkNotFio, setSdkNotFio] = useState(false);

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
    setFioAllProgress(prevState => prevState + Math.floor(Math.random() * 7))
  }, fioCallAllInProgress ? 600 : undefined)

  useInterval(() => {
    setFioOneByOneProgress(prevState => prevState + Math.floor(Math.random() * 3))
  }, fioCallOneByOneInProgress ? 800 : undefined)

  const getDrives = async () => {
    const res = await fetch(`/api/drives`)
    const drivesResponse = await res.json()
    setDrives(drivesResponse);
    if (onDataReceived) {
      onDataReceived({ devices: drivesResponse })
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
      setFioOneByOneProgress(1);
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
      let driveName = drives[driveIndex].path
      let led_blue = driveLeds[driveName][2] // led.*_b
    
      if (toggleLeds[driveName]) {
        setToggleLeds(prevState => { return { ...prevState, [driveName]: false } })
        await LedService.callOneLed(led_blue, "0")
      } else {
        setToggleLeds(prevState => { return { ...prevState, [driveName]: true } })
        await LedService.callOneLed(led_blue, "99")
      }
    } else {
      console.error(`device: ${device} mapping cannot be resolved`)
    }
  }

  const getSlotNumberByLed = (device: string) => {
    if (!device.length) return;
    if (device.indexOf(":") > -1) return `1 to ${drives.length}`

    device = device.replace(/\/dev\//,''); // remove '/dev/' if any
    let driveIndex = drives.findIndex(d => d.device === device)

    if (driveIndex > -1) {
      let driveName = drives[driveIndex].path
      let ledOne = driveLeds ? driveLeds[driveName][0] : '' // led.*_r
      const numberPattern = /\d+/g;
      return ledOne.match(numberPattern)?.join('')
    }
  }

  return (
    <>
      <Box style={{textAlign: 'left', padding: '10px 0 0 10px '}}>
        <HighlightedName>{drives.length +' drives'}</HighlightedName>
      </Box>
      <Box style={{overflowY: 'auto', height: '100%'}}>
        <Flex 
          alignItems={'center'}
          justifyContent={'center'}
          paddingBottom={'10px'}
        >      
          <Box width={'210px'}>
            <ProgressButton  
              type='flashing'
              progressText='Writing...'
              active={fioCallAllInProgress}
              percentage={fioAllProgress}
              position={fioAllProgress}
              disabled={false}
              cancel={()=> cancelRun()}
              warning={false}
              callback={() => callFioRunAll()}
              text='Write simultaneously'
            />
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
              disabled={false}
              cancel={()=> cancelRun()}
              warning={false}
              callback={() => callFioOneByOne(0)}
              text='Write independently'
            /> 
          </Box>          
        </Flex>  
        <Flex 
          alignItems={'center'}
          justifyContent={'center'}
          paddingBottom={'10px'}
        >
          Use fio &nbsp;
          <Checkbox 
            toggle 
            onChange={() => setSdkNotFio(prev => !prev)} 
            checked={sdkNotFio}
            label="Use sdk"
            disabled={fioCallAllInProgress || fioCallOneByOneInProgress}
          />
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
          style={{padding: '15px 0 30px 0', marginBottom: '40px' }}
      >
        <Button outline onClick={() => onBack ? onBack() : null }>Back</Button>
         &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; 
        <Button primary onClick={() => onNext ? onNext() : null }>Next</Button>
      </Flex>
    </>
  );
};