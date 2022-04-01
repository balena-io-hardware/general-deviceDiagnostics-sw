import * as crypto from 'crypto'
import fs from 'fs'
import path from 'path'

import { 
    MultiDestinationProgress,
    OnFailFunction, 
    OnProgressFunction, 
    pipeSourceToDestinations
  } from 'etcher-sdk/build/multi-write'
import { SourceDestination, File } from 'etcher-sdk/build/source-destination';

import { ReadOnlyMemoryStream } from '../services/ReadOnlyMemoryStream';

const devices = process.argv[2].split(':')
const size = parseInt(process.argv[3])
const numBuffers = parseInt(process.argv[4])

const onFail: OnFailFunction = async (dest: SourceDestination) => {
  console.log(`Error during write | ${(await dest.getMetadata()).url}`)
}

const onProgress: OnProgressFunction = (progress: MultiDestinationProgress) => {
  const jsonstring = JSON.stringify(progress)
  console.log(jsonstring);
  fs.writeFileSync(path.join(__dirname, '..', 'last_sdk_result.json'), `${process.argv[2]} => ${jsonstring}`)
}

const readBuffer = Buffer.from(crypto.randomBytes(size).toString('hex'));
const source = new ReadOnlyMemoryStream(readBuffer);

const destinations = devices.map((d: string) => new File({ path: d, write: true }))

const task = pipeSourceToDestinations({ 
    source, 
    destinations,
    onFail,
    onProgress,
    numBuffers
})

const run = async () => {
  await task;
}

run()