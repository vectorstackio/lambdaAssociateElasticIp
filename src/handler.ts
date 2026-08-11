// handler.ts

import {
  EC2Client,
  AssociateAddressCommand
} from '@aws-sdk/client-ec2'

import type {
  APIGatewayProxyHandler
} from 'aws-lambda'


const ec2 = new EC2Client({
  region: process.env.AWS_REGION
})


export const handler: APIGatewayProxyHandler = async (
  event
) => {

  try {

    const body =
      typeof event.body === 'string'
        ? JSON.parse(event.body)
        : event.body

    const {
      allocationId,
      instanceId
    } = body


    if (!allocationId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'allocationId is required'
        })
      }
    }


    if (!instanceId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'instanceId is required'
        })
      }
    }


    const result =
      await ec2.send(
        new AssociateAddressCommand({
          AllocationId:
            allocationId,

          InstanceId:
            instanceId
        })
      )


    return {
      statusCode: 200,

      body: JSON.stringify({
        success: true,

        allocationId,

        instanceId,

        associationId:
          result.AssociationId
      })
    }


  } catch (err) {

    console.error(
      'Error in associateElasticIpLambda:',
      err
    )


    return {
      statusCode: 500,

      body: JSON.stringify({
        error:
          'Internal server error in associateElasticIpLambda'
      })
    }
  }
}