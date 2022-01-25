import { Signer, Contract, providers } from 'ethers'
import { Interface, getAddress, hexZeroPad } from 'ethers/lib/utils'
import React, { useEffect, useState } from 'react'
import ClipLoader from 'react-spinners/ClipLoader'
import { Erc721TokenData, TokenMapping } from '../common/interfaces'
import Erc721Token from './Erc721Token'
import { getLogs, getTokenIcon } from '../common/util'
import { getOpenSeaProxyAddress, getTokenData } from './util'
import { ERC721Metadata } from '../common/abis'

interface Props {
  provider: providers.Provider
  chainId: number
  filterRegisteredTokens: boolean
  filterZeroBalances: boolean
  tokenMapping?: TokenMapping
  signer?: Signer
  signerAddress?: string
  inputAddress?: string
}

function Erc721TokenList({
  provider,
  chainId,
  filterRegisteredTokens,
  filterZeroBalances,
  tokenMapping,
  signer,
  signerAddress,
  inputAddress
}: Props) {
  const [tokens, setTokens] = useState<Erc721TokenData[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [openSeaProxyAddress, setOpenSeaProxyAddress] = useState<string>()

  useEffect(() => {
    loadData()
  }, [inputAddress])

  const loadData = async () => {
    if (!inputAddress) return

    setLoading(true)

    const erc721Interface = new Interface(ERC721Metadata)
    const latestBlockNumber = await provider.getBlockNumber()

    // Get all "approvals for a specific index" made from the input address
    const approvalFilter = {
      topics: [erc721Interface.getEventTopic('Approval'), hexZeroPad(inputAddress, 32)]
    }
    const approvalEvents = await getLogs(provider, approvalFilter, 0, latestBlockNumber)

    // Get all "approvals for all indexes" made from the input address
    const approvalForAllFilter = {
      topics: [erc721Interface.getEventTopic('ApprovalForAll'), hexZeroPad(inputAddress, 32)]
    }
    const approvalForAllEvents = await getLogs(provider, approvalForAllFilter, 0, latestBlockNumber)

    // Get all transfers sent to the input address
    const transferFilter = {
      topics: [erc721Interface.getEventTopic('Transfer'), undefined, hexZeroPad(inputAddress, 32)]
    }
    const transferEvents = await getLogs(provider, transferFilter, 0, latestBlockNumber)

    const allEvents = [...approvalEvents, ...approvalForAllEvents, ...transferEvents];

    // Filter unique token contract addresses and convert all events to Contract instances
    const tokenContracts = allEvents
      .filter((event, i) => i === allEvents.findIndex((other) => event.address === other.address))
      .map((event) => new Contract(getAddress(event.address), ERC721Metadata, provider))

    // Look up token data for all tokens, add their lists of approvals
    const unsortedTokens = await Promise.all(
      tokenContracts.map(async (contract) => {
        const approvalsForAll = approvalForAllEvents.filter(approval => approval.address === contract.address)
        const approvals = approvalEvents.filter(approval => approval.address === contract.address)
        const icon = await getTokenIcon(contract.address, chainId, tokenMapping)

        // Skip registration checks for NFTs
        const registered = true

        try {
          const tokenData = await getTokenData(contract, inputAddress, tokenMapping)
          return { ...tokenData, icon, contract, registered, approvals, approvalsForAll }
        } catch {
          // If the call to getTokenData() fails, the token is not an ERC721 token so
          // we do not include it in the token list.
          return undefined
        }
      })
    )

    // Filter undefined tokens and sort tokens alphabetically on token symbol
    const sortedTokens = unsortedTokens
      .filter((token) => token !== undefined)
      .sort((a: any, b: any) => a.symbol.localeCompare(b.symbol))

    const openSeaProxy = await getOpenSeaProxyAddress(inputAddress, provider)

    setTokens(sortedTokens)
    setOpenSeaProxyAddress(openSeaProxy)
    setLoading(false)
  }

  if (loading) {
    return (<ClipLoader css="margin-bottom: 10px;" size={40} color={'#000'} loading={loading} />)
  }

  if (tokens.length === 0) {
    return (<div className="TokenList">No token balances</div>)
  }

  const tokenComponents = tokens
  .filter((token) => !filterRegisteredTokens || token.registered)
  .filter((token) => !filterZeroBalances || ! (String(token.balance) === '0'))
  .map((token) => (
    <Erc721Token
      key={token.contract.address}
      token={token}
      provider={provider}
      chainId={chainId}
      signer={signer}
      signerAddress={signerAddress}
      inputAddress={inputAddress}
      openSeaProxyAddress={openSeaProxyAddress}
    />
  ))

return (<div className="TokenList">{tokenComponents}</div>)
}

export default Erc721TokenList