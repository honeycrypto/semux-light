import { Either } from 'tsmonad'
import BigNumber from 'bignumber.js'
import { exec, AccountRemote } from './api'

export interface DelegateTypeRemote {
  address: string
  name: string
  registeredAt: string
  votes: string
  blocksForged: string
  turnsHit: string
  turnsMissed: string
  validator: boolean
}

export interface DelegateType {
  address: string
  name: string
  votes: BigNumber
  blocksForged: number
  turnsHit: number
  turnsMissed: number
  rate: number
  validator: boolean
}

export type DelegatesResponse = Either<string, DelegateType[]>

export async function fetchDelegates(): Promise<DelegatesResponse> {
  const path = '/v2.0.0/delegates'
  const remoteE = await exec<DelegateTypeRemote[]>('GET', path)
  return remoteE.fmap((remotes) => remotes.map((r) => {
    const turnsHit = parseInt(r.turnsHit, 10)
    const turnsMissed = parseInt(r.turnsMissed, 10)
    const total = turnsHit + turnsMissed
    return {
      address: r.address,
      name: r.name,
      votes: new BigNumber(r.votes).div(1e9),
      blocksForged: parseInt(r.blocksForged, 10),
      turnsHit,
      turnsMissed,
      rate: total === 0 ? 0 : (turnsHit * 100 / total),
      validator: r.validator,
    }
  }))
}

export interface AccountVoteTypeRemote {
  delegate: {
    address: string,
  },
  votes: string,
}

export interface AccountVote {
  delegate: string
  votes: BigNumber
}

export type VotesResponse = Either<string, AccountVote[]>

export async function fetchVotes(address: string): Promise<VotesResponse> {
  const path = `/v2.0.0/account/votes?address=${address}`
  const remotesE = await exec<AccountVoteTypeRemote[]>('GET', path)
  return remotesE.fmap((remotes) => remotes.map((r) => ({
    delegate: r.delegate.address,
    votes: new BigNumber(r.votes).div(1e9),
  })))
}
