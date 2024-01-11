import * as utils from "./utils.js";
import { promises, createReadStream } from 'fs';
import { join, resolve, dirname } from 'path';
import { createHash } from 'crypto';
import { homedir } from 'os';

import type {
	Fetch,
	Config,
    GenerateRequest,
    PullRequest,
    PushRequest,
    CreateRequest,
    EmbeddingsRequest,
	GenerateResponse,
	EmbeddingsResponse,
    ListResponse,
    ProgressResponse,
    ErrorResponse,
    StatusResponse,
    DeleteRequest,
    CopyRequest,
    ShowResponse,
    ShowRequest,
    ChatRequest,
    ChatResponse,
} from "./interfaces.js";


export class Ollama {
	private readonly config: Config;
	private readonly fetch: Fetch;

	constructor (config?: Partial<Config>) {
		this.config = {
			address: config?.address ?? "http://127.0.0.1:11434"
		};

		let f: Fetch | null = null;

		if (config?.fetch != null) {
			f = config.fetch;
		} else if (typeof fetch !== "undefined") {
			f = fetch;
		} else if (typeof window !== "undefined") {
			f = window.fetch;
		}

		if (f == null) {
			throw new Error("unable to find fetch - please define it via 'config.fetch'");
		}

		this.fetch = f;
	}

    private async processStreamableRequest<T extends object>(endpoint: string, request: { stream?: boolean } & Record<string, any>): Promise<T | AsyncGenerator<T>> {
        request.stream = request.stream ?? false;
        const response = await utils.post(this.fetch, `${this.config.address}/api/${endpoint}`, { ...request });
    
        if (!response.body) {
            throw new Error("Missing body");
        }
    
        const itr = utils.parseJSON<T | ErrorResponse>(response.body);
    
        if (request.stream) {
            return (async function* () {
                for await (const message of itr) {
                    if ('error' in message) {
                        throw new Error(message.error);
                    }
                    yield message;
                    // message will be done in the case of chat and generate
                    // message will be success in the case of a progress response (pull, push, create)
                    if ((message as any).done || (message as any).status === "success") {
                        return;
                    }
                }
                throw new Error("Did not receive done or success response in stream.");
            })();
        } else {
            const message = await itr.next();
            if (!message.value.done && (message.value as any).status !== "success") {
                throw new Error("Expected a completed response.");
            }
            return message.value;
        }
    }

    private async encodeImage(image: Uint8Array | string): Promise<string> {
        if (typeof image === 'string') {
            // If image is a string, treat it as a file path
            const fileBuffer = await promises.readFile(resolve(image));
            return Buffer.from(fileBuffer).toString('base64');
        } else {
            return Buffer.from(image).toString('base64');
        }
    }

    private async parseModelfile(modelfile: string, mfDir: string = process.cwd()): Promise<string> {
        const out: string[] = [];
        const lines = modelfile.split('\n');
        for (const line of lines) {
            const [command, args] = line.split(' ', 2);
            if (['FROM', 'ADAPTER'].includes(command.toUpperCase())) {
                const path = this.resolvePath(args.trim(), mfDir);
                if (await this.fileExists(path)) {
                    out.push(`${command} @${await this.createBlob(path)}`);
                } else {
                    out.push(`${command} ${args}`);
                }
            } else {
                out.push(line);
            }
        }
        return out.join('\n');
    }

    private resolvePath(inputPath, mfDir) {
        if (inputPath.startsWith('~')) {
            return join(homedir(), inputPath.slice(1));
        }
        return resolve(mfDir, inputPath);
    }

    private async fileExists(path: string): Promise<boolean> {
        try {
            await promises.access(path);
            return true;
        } catch {
            return false;
        }
    }

    private async createBlob(path: string): Promise<string> {
        if (typeof ReadableStream === 'undefined') {
            // Not all fetch implementations support streaming
            // TODO: support non-streaming uploads
            throw new Error("Streaming uploads are not supported in this environment.");
        }

        // Create a stream for reading the file
        const fileStream = createReadStream(path);

        // Compute the SHA256 digest
        const sha256sum = await new Promise<string>((resolve, reject) => {
            const hash = createHash('sha256');
            fileStream.on('data', data => hash.update(data));
            fileStream.on('end', () => resolve(hash.digest('hex')));
            fileStream.on('error', reject);
        });

        const digest = `sha256:${sha256sum}`;

        try {
            await utils.head(this.fetch, `${this.config.address}/api/blobs/${digest}`);
        } catch (e) {
            if (e instanceof Error && e.message.includes('404')) {
                // Create a new readable stream for the fetch request
                const readableStream = new ReadableStream({
                    start(controller) {
                        fileStream.on('data', chunk => {
                            controller.enqueue(chunk);  // Enqueue the chunk directly
                        });
                
                        fileStream.on('end', () => {
                            controller.close();  // Close the stream when the file ends
                        });
                
                        fileStream.on('error', err => {
                            controller.error(err);  // Propagate errors to the stream
                        });
                    }
                });

                await utils.post(this.fetch, `${this.config.address}/api/blobs/${digest}`, readableStream);
            } else {
                throw e;
            }
        }

        return digest;
    }

    generate(request: GenerateRequest & { stream: true }): Promise<AsyncGenerator<GenerateResponse>>;
    generate(request: GenerateRequest & { stream?: false }): Promise<GenerateResponse>;

    async generate(request: GenerateRequest): Promise<GenerateResponse | AsyncGenerator<GenerateResponse>> {
        if (request.images) {
            request.images = await Promise.all(request.images.map(this.encodeImage));
        }
        return this.processStreamableRequest<GenerateResponse>('generate', request);
    }

    chat(request: ChatRequest & { stream: true }): Promise<AsyncGenerator<ChatResponse>>;
    chat(request: ChatRequest & { stream?: false }): Promise<ChatResponse>;

    async chat(request: ChatRequest): Promise<ChatResponse | AsyncGenerator<ChatResponse>> {
        if (request.messages) {
            for (const message of request.messages) {
                if (message.images) {
                    message.images = await Promise.all(message.images.map(this.encodeImage));
                }
            }
        }
        return this.processStreamableRequest<ChatResponse>('chat', request);
    }

    pull(request: PullRequest & { stream: true }): Promise<AsyncGenerator<ProgressResponse>>;
    pull(request: PullRequest & { stream?: false }): Promise<ProgressResponse>;

    async pull (request: PullRequest):  Promise<ProgressResponse | AsyncGenerator<ProgressResponse>> {
        return this.processStreamableRequest<ProgressResponse>('pull', request);
	}

    push(request: PushRequest & { stream: true }): Promise<AsyncGenerator<ProgressResponse>>;
    push(request: PushRequest & { stream?: false }): Promise<ProgressResponse>;

    async push (request: PushRequest):  Promise<ProgressResponse | AsyncGenerator<ProgressResponse>> {
        return this.processStreamableRequest<ProgressResponse>('push', request);
	}

    create(request: CreateRequest & { stream: true }): Promise<AsyncGenerator<ProgressResponse>>;
    create(request: CreateRequest & { stream?: false }): Promise<ProgressResponse>;

	async create (request: CreateRequest): Promise<ProgressResponse | AsyncGenerator<ProgressResponse>> {
        let modelfileContent = '';
        if (request.path) {
            modelfileContent = await promises.readFile(request.path, { encoding: 'utf8' });
            modelfileContent = await this.parseModelfile(modelfileContent, dirname(request.path));
        } else if (request.modelfile) {
            modelfileContent = await this.parseModelfile(request.modelfile);
        } else {
            throw new Error('Must provide either path or modelfile to create a model');
        }

        return this.processStreamableRequest<ProgressResponse>('create', {
            name: request.name,
            stream: request.stream,
            modelfile: modelfileContent,
        });
	}

    async delete (request: DeleteRequest): Promise<StatusResponse> {
		await utils.del(this.fetch, `${this.config.address}/api/delete`, { ...request });
        return { status: "success" };
	}
    
    async copy (request: CopyRequest): Promise<StatusResponse> {
		await utils.post(this.fetch, `${this.config.address}/api/copy`, { ...request });
        return { status: "success" };
	}

    async list (): Promise<ListResponse> {
		const response = await utils.get(this.fetch, `${this.config.address}/api/tags`);
		const listResponse = await response.json() as ListResponse;
		return listResponse;
	}

    async show (request: ShowRequest): Promise<ShowResponse> {
        const response = await utils.post(this.fetch, `${this.config.address}/api/show`, { ...request });
        const showResponse = await response.json() as ShowResponse;
        return showResponse;
    }

	async embeddings (request: EmbeddingsRequest): Promise<EmbeddingsResponse> {
		const response = await utils.post(this.fetch, `${this.config.address}/api/embeddings`, { request });
		const embeddingsResponse = await response.json() as EmbeddingsResponse;
		return embeddingsResponse;
	}
}
