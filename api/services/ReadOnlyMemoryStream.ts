import * as Stream from 'stream'

import { 
    CreateReadStreamOptions,
    Metadata, 
    SourceDestination 
} from 'etcher-sdk/build/source-destination'

import { 
    AlignedReadableState,
    isAlignedLockableBuffer
} from 'etcher-sdk/build/aligned-lockable-buffer'
 
export interface ReadResult {
	bytesRead: number;
	buffer: Buffer;
}

class MemoryReadStream extends Stream.Readable {
    private source: ReadOnlyMemoryStream
    private bytesRead: number
    private alignment?: number
    private alignedReadableState?: AlignedReadableState
    private end?: number
    private chunkSize?: number
    private maxRetries?: number;
    // private numBuffers: number;

    constructor({ source, alignment, start, end, chunkSize, maxRetries, numBuffers = 1, }: {
        source: ReadOnlyMemoryStream;
        alignment?: number;
        start?: number;
        end?: number;
        chunkSize?: number;
        maxRetries?: number;
        numBuffers?: number;
    }) {
        super({ objectMode: true, highWaterMark: numBuffers - 1 });
		this.source = source;
		this.alignment = alignment;
		this.bytesRead = start || 0;
		this.end = end;
		this.chunkSize = chunkSize || 64 * 1024;
		this.maxRetries = maxRetries;
		if (alignment !== undefined) {
			this.chunkSize = Math.max(
				Math.floor((chunkSize || 0) / alignment) * alignment,
				alignment,
			);
			this.alignedReadableState = new AlignedReadableState(
				chunkSize || 1,
				alignment,
				numBuffers,
			);
		}
    }

    private async tryRead(buffer: Buffer): Promise<ReadResult> {
		return await this.source.read(buffer, 0, buffer.length, this.bytesRead);			
	}

	public async _read(): Promise<void> {
		if (this.bytesRead > this.end!) {
			this.push(null);
			return;
		}
		let buffer =
			this.alignment !== undefined
				? this.alignedReadableState!.getCurrentBuffer()
				: Buffer.allocUnsafe(this.chunkSize!);
		const toRead = this.end! - this.bytesRead + 1;
		if (toRead < buffer.length) {
			buffer = buffer.slice(0, toRead);
		}
		try {
			let unlock: undefined | (() => void);
			if (isAlignedLockableBuffer(buffer)) {
				unlock = await buffer.lock();
			}
			let bytesRead;
			try {
				({ bytesRead } = await this.tryRead(buffer));
			} finally {
				unlock?.();
			}
			this.bytesRead += bytesRead;
			if (bytesRead !== 0) {
				this.push(buffer.slice(0, bytesRead));
			} else {
				this.push(null);
			}
		} catch (error) {
			this.emit('error', error);
		}
	}
}

export class ReadOnlyMemoryStream extends SourceDestination {
    
    constructor(private _contents: Buffer) {
        super();
    }

	public async canRead(): Promise<boolean> {
		return true;
	}

	public async canWrite(): Promise<boolean> {
		return false;
	}

	public async canCreateReadStream(): Promise<boolean> {
		return true;
	}

	public canCreateWriteStream(): Promise<boolean> {
		return this.canWrite();
	}

	public canCreateSparseWriteStream(): Promise<boolean> {
		return this.canWrite();
	}

	protected async _getMetadata(): Promise<Metadata> {
		return {
			size: this._contents.length
		};
	}

	public async read(
		buffer: Buffer,
		bufferOffset: number,
		length: number,
		sourceOffset: number,
	): Promise<ReadResult> {        
        this._contents.copy(buffer, bufferOffset, sourceOffset, bufferOffset + length)
		return {
            buffer: buffer,
            bytesRead: length
        };
	}

	public async write(
		buffer: Buffer,
		bufferOffset: number,
		length: number,
		fileOffset: number,
	): Promise<any> {
        return {};
	}

	public async createReadStream({
		emitProgress = false,
		start = 0,
		end,
		alignment,
		numBuffers,
	}: CreateReadStreamOptions = {}): Promise<NodeJS.ReadableStream> {
		await this.open();
		const metadata = await this.getMetadata();
		if (metadata.size! !== 0) {
			// workaround for special files like /dev/zero or /dev/random
			const lastByte = metadata.size! - 1;
			end = end === undefined ? lastByte : Math.min(end, lastByte);
		}
		
        return new MemoryReadStream({
            source: this,
            alignment,
            start,
            end,
            numBuffers
        });
		
	}

	public async createWriteStream({
		highWaterMark,
	}: { highWaterMark?: number } = {}): Promise<NodeJS.WritableStream> {
		return new Stream.Writable();
	}


	protected async _open(): Promise<void> {
		// no need 
	}

	protected async _close(): Promise<void> {
		// done
	}

    
}