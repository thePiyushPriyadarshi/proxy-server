import {z} from "zod"

export const workerMessageSchema = z.object({
    requestType : z.enum(["HTTP","HTTPS"]),
    headers : z.any(),
    body : z.any(),
    url : z.string()
});

export const workerMessageReplySchema = z.object({
   data : z.string().optional(),
   errorCode : z.number().optional(),
   error : z.string().optional(),
});

export type WorkerMessageType = z.infer<typeof workerMessageSchema>
export type WorkerMessageReplyType = z.infer<typeof workerMessageReplySchema>