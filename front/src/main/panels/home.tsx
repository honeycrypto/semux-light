import { h } from 'hyperapp'
import { State } from '../app'
import BigNumber from 'bignumber.js'
import { ZERO, concat, mutableReverse } from '../lib/utils'
import { DateTime } from 'luxon'
import { BlockType, fetchLatestBlock } from '../model/block'
import { AccountType, fetchAccount } from '../model/account'
import { Maybe } from 'tsmonad'
import { locationAddrs, LocationState, locationAddr1st } from '../lib/location'
import { fetchLastTxs, TransactionType, caseTypeOf } from '../model/transaction'
import { localeDateTime, transfer, sem, addressAbbr } from '../lib/format'

const MAX_TXS_SIZE = 5

export interface HomeState {
  errorMessage: string,
  block: Maybe<BlockType>
  accounts: AccountType[]
  transactions: TransactionType[]
}

export const initialHomeState: HomeState = {
  errorMessage: '',
  block: Maybe.nothing(),
  accounts: [],
  transactions: [],
}

type AccountAndTxs = [AccountType, TransactionType[]]
async function fetchAccAndTxs(address: string): Promise<AccountAndTxs> {
  const account = await fetchAccount(address)
  const transactions = await fetchLastTxs(account, { page: 0, size: MAX_TXS_SIZE })
  return [account, transactions]
}

export interface HomeActions {
  fetch: (ls: LocationState) => (s: HomeState, a: HomeActions) => HomeState
  fetchBlockResponse: (b: BlockType) => (s: HomeState) => HomeState
  fetchAccountsResponse: (a: AccountAndTxs[]) => (s: HomeState) => HomeState
  fetchError: (error) => (s: HomeState) => HomeState
}

export const rawHomeActions: HomeActions = {
  fetch: (locationState) => (state, actions) => {
    fetchLatestBlock()
      .then(actions.fetchBlockResponse)
      .catch(actions.fetchError)

    Promise
      .all(locationAddrs(locationState).map(fetchAccAndTxs))
      .then(actions.fetchAccountsResponse)
      .catch(actions.fetchError)

    return { ...state, errorMessage: '' }
  },
  fetchBlockResponse: (block) => (state) => ({
    ...state,
    block: Maybe.just(block),
  }),
  fetchAccountsResponse: (accAndTxsArr) => (state) => {
    const transactions = Array.from(
      concat(accAndTxsArr.map(([_, b]) => b))
        .reduce((map, tx) => map.set(tx.hash, tx), new Map<string, TransactionType>())
        .values(),
    )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, MAX_TXS_SIZE)

    return {
      ...state,
      accounts: accAndTxsArr.map(([a, _]) => a),
      transactions,
    }
  },
  fetchError: (error) => (state) => ({
    ...state,
    errorMessage: error.message,
  }),
}

export function HomeView(rootState: State) {
  const state = rootState.home
  return <div class="pa2">
    {state.errorMessage
      ? <div class="dark-red">{state.errorMessage}</div>
      : ''
    }
    <div class="flex">
      <div class="mw5 mw6-ns hidden ba">
        <h1 class="f5 bg-near-black white mv0 pv2 ph3">Overview</h1>
        <div class="pa3">
          <dl class="f6 lh-title mv2">
            <dt class="dib b">Block #:</dt>{' '}
            <dd class="dib ml0">
              {state.block.map((b) => b.number.toLocaleString()).valueOr('')}
            </dd>
          </dl>
          <dl class="f6 lh-title mv2">
            <dt class="dib b">Block time:</dt>{' '}
            <dd class="dib ml0">{
              state.block.map(({ timestamp: d }) => localeDateTime(d)).valueOr('')
              }
            </dd>
          </dl>
          <dl class="f6 lh-title mv2">
            <dt class="dib b">Coinbase:</dt>{' '}
            <dd class="dib ml0">
              {addressAbbr(locationAddr1st(rootState.location) || '')}
            </dd>
          </dl>
          <dl class="f6 lh-title mv2">
            <dt class="dib b">Available:</dt>{' '}
            <dd class="dib ml0">{sem(state.accounts
              .map((a) => a.available)
              .reduce((sum, a) => sum.plus(a), ZERO),
              )}
            </dd>
          </dl>
          <dl class="f6 lh-title mv2">
            <dt class="dib b">Locked:</dt>{' '}
            <dd class="dib ml0">{sem(state.accounts
              .map((a) => a.locked)
              .reduce((sum, a) => sum.plus(a), ZERO),
              )}</dd>
          </dl>
          <dl class="f6 lh-title mv2">
            <dt class="dib b">Total Balance:</dt>{' '}
            <dd class="dib ml0">{sem(state.accounts
              .map((a) => a.available.plus(a.locked))
              .reduce((sum, a) => sum.plus(a), ZERO),
              )}</dd>
          </dl>
        </div>
      </div>

      <div class="ml3 mw5 mw6-ns hidden ba">
        <h1 class="f5 bg-near-black white mv0 pv2 ph3">Transactions</h1>
        <div class="pa3">

          {state.transactions.map((tx) => {
            const [mathSign, img] = mathSignAndImg(state, tx)
            return <div class="flex">
              <img src={`resources/${img}`} class="w2 h2 mt2 mr2" />
              <dl class="f6 lh-title mv2">
                <dt class="f6 b">{localeDateTime(tx.timestamp)}</dt>
                <dd class="ml0">{transfer(tx.from, tx.to)}</dd>
              </dl>
              <dl class="ml3 f6 lh-title mv2">
                <dt class="f6 b">{mathSign}{sem(tx.value)}</dt>
              </dl>
            </div>
          })}

        </div>
      </div>
    </div>
  </div>
}

export function mathSignAndImg(state: HomeState, tx: TransactionType): [string, string] {
  const UNKNOWN: [string, string] = ['', 'unknown.png']
  return caseTypeOf<[string, string]>(tx, UNKNOWN, {
    vote: () => ['', 'vote.png'],
    unvote: () => ['', 'unvote.png'],
    transfer: () => {
      const ourFrom = state.transactions.some((t) => t.from === tx.from)
      const ourTo = state.transactions.some((t) => t.to === tx.to)
      return ourFrom && ourTo ? ['', 'cycle.png']
        : ourFrom ? ['-', 'outbound.png']
          : ourTo ? ['+', 'inbound.png']
            : UNKNOWN
    },
  })
}