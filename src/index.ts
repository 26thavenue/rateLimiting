import { Context, Hono } from 'hono'
import {todos} from '../data.json'
import {Ratelimit} from '@upstash/ratelimit'
import {env} from 'hono/adapter'
import { BlankInput, Env } from 'hono/types'
import { Redis } from '@upstash/redis/cloudflare'

declare module "hono"{
  interface ContextVariableMap{
    ratelimit :Ratelimit
  }
}

const app = new Hono()

const cache = new Map()

class RedisRateLimiter {
   static instance: Ratelimit

   static getInstance(c:Context<Env, "/mood:id", BlankInput>){
    if(!this.instance){
        const {UPSTASH_REDIS_URL,UPSTASH_REDIS_TOKEN } = env<{
          UPSTASH_REDIS_URL: string
          UPSTASH_REDIS_TOKEN: string
        }>(c)

        const redisClient = new Redis({
          url: UPSTASH_REDIS_URL,
          token: UPSTASH_REDIS_TOKEN
        })

        const rateLimit = new Ratelimit({
          redis: redisClient,
          limiter: Ratelimit.slidingWindow(2, "30 s"),
          ephemeralCache: cache
         
        })

        this.instance = rateLimit

        return this.instance

      }
    else{
      return this.instance
    }

  }
}

app.use(async (c, next) => {
  const ratelimit = RedisRateLimiter.getInstance(c)

  c.set('ratelimit', ratelimit)

  await next()
})
 

  


app.get('/', (c) => {
  return c.json({message:'Hello'})
})

app.get('/mood', (c) => {
  return c.json({message:" Welcome to your new mood log"})
})

app.get('/mood/:id', async(c) =>{
  const ratelimit = c.get('ratelimit')
  const ip = c.req.raw.headers.get('CF-Connecting-IP')

  const {success }= await ratelimit.limit(ip ?? 'anonymous')  

  console.log(success)

  if(success){
    const todoId = c.req.param('id')  

    const findTodo = Array.isArray(todos) && todos.find((todo) => todo.id === todoId)

    const todo = findTodo || {message :'Id not found'}

    

    return c.json(todo)
  }else{
    return c.json({message: 'Too many requests'}, {status:429})
  }
  
  
  
})



export default app
