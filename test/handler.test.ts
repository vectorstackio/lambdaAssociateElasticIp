import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { APIGatewayProxyEvent, Context } from 'aws-lambda'

const { send, commands } = vi.hoisted(() => ({
  send: vi.fn(),
  commands: vi.fn()
}))

vi.mock('@aws-sdk/client-ec2', () => ({
  EC2Client: class {
    send = send
  },
  AssociateAddressCommand: class {
    constructor(input: unknown) {
      commands(input)
    }
  }
}))

import { handler } from '../src/handler'

const invoke = (body: unknown) => handler(
  { body } as APIGatewayProxyEvent,
  {} as Context,
  vi.fn()
)

const allocationId = 'eipalloc-example'
const instanceId = 'i-example'

describe('associate Elastic IP handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    send.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it.each([
    ['JSON string', JSON.stringify({ allocationId, instanceId })],
    ['parsed object', { allocationId, instanceId }]
  ])('associates an address from a %s body', async (_, body) => {
    send.mockResolvedValue({ AssociationId: 'eipassoc-example' })

    const response = await invoke(body)

    expect(commands).toHaveBeenCalledExactlyOnceWith({ AllocationId: allocationId, InstanceId: instanceId })
    expect(send).toHaveBeenCalledOnce()
    expect(response).toEqual({
      statusCode: 200,
      body: JSON.stringify({ success: true, allocationId, instanceId, associationId: 'eipassoc-example' })
    })
    expect(console.log).not.toHaveBeenCalled()
    expect(console.warn).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('returns success when AWS omits the association ID', async () => {
    send.mockResolvedValue({})
    const response = await invoke({ allocationId, instanceId })
    expect(response).toEqual({ statusCode: 200, body: JSON.stringify({ success: true, allocationId, instanceId }) })
  })

  it.each([undefined, null, '', 0, false])('rejects a missing or falsy allocation ID: %s', async value => {
    const response = await invoke({ allocationId: value, instanceId })
    expect(response).toEqual({ statusCode: 400, body: JSON.stringify({ error: 'allocationId is required' }) })
    expect(send).not.toHaveBeenCalled()
    expect(commands).not.toHaveBeenCalled()
  })

  it.each([undefined, null, '', 0, false])('rejects a missing or falsy instance ID: %s', async value => {
    const response = await invoke({ allocationId, instanceId: value })
    expect(response).toEqual({ statusCode: 400, body: JSON.stringify({ error: 'instanceId is required' }) })
    expect(send).not.toHaveBeenCalled()
    expect(commands).not.toHaveBeenCalled()
  })

  it('checks allocation ID first when both fields are absent', async () => {
    expect(await invoke('{}')).toEqual({ statusCode: 400, body: JSON.stringify({ error: 'allocationId is required' }) })
    expect(send).not.toHaveBeenCalled()
  })

  it.each(['{', '', 'null', null, undefined])('handles an invalid or absent body: %s', async body => {
    const response = await invoke(body)
    expect(response).toEqual({ statusCode: 500, body: JSON.stringify({ error: 'Internal server error in associateElasticIpLambda' }) })
    expect(send).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledOnce()
  })

  it('handles an AWS rejection without exposing its details in the response', async () => {
    const error = new Error('AWS failure')
    send.mockRejectedValue(error)
    const response = await invoke({ allocationId, instanceId })
    expect(response).toEqual({ statusCode: 500, body: JSON.stringify({ error: 'Internal server error in associateElasticIpLambda' }) })
    expect(console.error).toHaveBeenCalledExactlyOnceWith('Error in associateElasticIpLambda')
  })

  it('does not log sensitive input on a validation failure', async () => {
    const secret = 'sensitive-token-example'
    await invoke({ allocationId: secret })
    expect(console.log).not.toHaveBeenCalled()
    expect(console.warn).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('does not log sensitive information contained in AWS errors', async () => {
    const secret = 'sensitive-token-example'
    send.mockRejectedValue(new Error(secret))
    const response = await invoke({ allocationId, instanceId })
    expect(console.error).toHaveBeenCalledExactlyOnceWith('Error in associateElasticIpLambda')
    expect(JSON.stringify(response)).not.toContain(secret)
  })
})
