/* eslint-disable prefer-const */
import { Pair, Token, Bundle } from '../types/schema'
import { log } from '@graphprotocol/graph-ts'
import { BigDecimal, Address, BigInt } from '@graphprotocol/graph-ts/index'
import { ZERO_BD, factoryContract, ADDRESS_ZERO, ONE_BD, UNTRACKED_PAIRS, DAI, USDC, USDT } from './helpers'

const WETH_ADDRESS = '0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83'
const USDC_WETH_PAIR = '0x2b4c76d0dc16be1c31d4c1dc53bf9b45987fc75c'  //WFTM -> USDC SPOOKY
const DAI_WETH_PAIR = '0xe120ffbda0d14f3bb6d6053e90e63c572a66a428'  //WFTM -> DAI SPOOKY
const USDT_WETH_PAIR = '0x5965e53aa80a0bcf1cd6dbdd72e6a9b2aa047410' // WFTM -> fUSDT SPOOKY
// minimum liquidity required to count towards tracked volume for pairs with small # of Lps
const MINIMUM_USD_THRESHOLD_NEW_PAIRS = BigDecimal.fromString('1000')

// minimum liquidity for price to get tracked
const MINIMUM_LIQUIDITY_THRESHOLD_ETH = BigDecimal.fromString('100')


export function getEthPriceInUSD(): BigDecimal {
  // fetch eth prices for each stablecoin
  let daiPair = Pair.load(DAI_WETH_PAIR) 
  let usdcPair = Pair.load(USDC_WETH_PAIR) 
  let usdtPair = Pair.load(USDT_WETH_PAIR) 

  // all 3 have been created
  if (
    daiPair !== null && daiPair.reserveETH.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH) 
    && usdcPair !== null && usdcPair.reserveETH.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)
    && usdtPair !== null && usdtPair.reserveETH.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) {
    // check if stable is first token in pair
    const isDaiFirst = daiPair.token0 == DAI
    const isUsdcFirst = usdcPair.token0 == USDC
    const isUsdtFirst = usdtPair.token0 == USDT

    const daiPairEth = isDaiFirst ? daiPair.reserve1 : daiPair.reserve0
    const usdcPairEth = isUsdcFirst ? usdcPair.reserve1 : usdcPair.reserve0
    const usdtPairEth = isUsdtFirst ? usdtPair.reserve1 : usdtPair.reserve0
    const totalLiquidityETH = daiPairEth
      .plus(usdcPairEth)
      .plus(usdtPairEth)

    const daiWeight = daiPairEth.div(totalLiquidityETH) 
    const usdcWeight = usdcPairEth.div(totalLiquidityETH)
    const usdtWeight = usdtPairEth.div(totalLiquidityETH)

    const daiPrice = isDaiFirst ? daiPair.token0Price : daiPair.token1Price
    const usdcPrice = isUsdcFirst ? usdcPair.token0Price : usdcPair.token1Price
    const usdtPrice = isUsdtFirst ? usdtPair.token0Price : usdtPair.token1Price

    return daiPrice.times(daiWeight)
      .plus(usdcPrice.times(usdcWeight))
      .plus(usdtPrice.times(usdtWeight))

    // dai and USDC have been created
  } else if (
    daiPair !== null &&
    daiPair.reserveETH.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH) &&
    usdcPair !== null &&
    usdcPair.reserveETH.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)
  ) {
    const isDaiFirst = daiPair.token0 == DAI
    const isUsdcFirst = usdcPair.token0 == USDC

    const daiPairEth = isDaiFirst ? daiPair.reserve1 : daiPair.reserve0

    const usdcPairEth = isUsdcFirst ? usdcPair.reserve1 : usdcPair.reserve0

    const totalLiquidityETH = daiPairEth.plus(usdcPairEth)

    const daiWeight = daiPairEth.div(totalLiquidityETH)

    const usdcWeight = usdcPairEth.div(totalLiquidityETH)

    const daiPrice = isDaiFirst ? daiPair.token0Price : daiPair.token1Price

    const usdcPrice = isUsdcFirst ? usdcPair.token0Price : usdcPair.token1Price

    return daiPrice.times(daiWeight).plus(usdcPrice.times(usdcWeight))


  } else if (usdcPair !== null && usdcPair.reserveETH.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) {
    const isUsdcFirst = usdcPair.token0 == USDC
    return isUsdcFirst ? usdcPair.token0Price : usdcPair.token1Price
  } else if (usdtPair !== null && usdtPair.reserveETH.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) {
    const isUsdtFirst = usdtPair.token0 == USDT
    return isUsdtFirst ? usdtPair.token0Price : usdtPair.token1Price
  } else if (daiPair !== null && daiPair.reserveETH.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) {
    const isDaiFirst = daiPair.token0 == DAI
    return isDaiFirst ? daiPair.token0Price : daiPair.token1Price
  } else {
    return ZERO_BD
}
}

// token where amounts should contribute to tracked volume and liquidity
let WHITELIST: string[] = [
  '0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83', // WETH
  '0x8d11ec38a3eb5e956b052f67da8bdc9bef8abf3e', // DAI
  '0x04068da6c83afcfa0e13ba15a6696662335d5b75', // USDC
  '0x049d68029688eabf473097a2fc38ef61633a3c7a', // USDT
]


/**
 * Search through graph to find derived Eth per token.
 * @todo update to be derived ETH (add stablecoin estimates)
 **/
export function findEthPerToken(token: Token): BigDecimal {
  if (token.id == WETH_ADDRESS) {
    return ONE_BD
  }
  // loop through whitelist and check if paired with any
  for (let i = 0; i < WHITELIST.length; ++i) {
    let pairAddress = factoryContract.getPair(Address.fromString(token.id), Address.fromString(WHITELIST[i]))
    if (pairAddress.toHexString() != ADDRESS_ZERO) {
      let pair = Pair.load(pairAddress.toHexString())
      if (pair.token0 == token.id && pair.reserveETH.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) {
        let token1 = Token.load(pair.token1)
        return pair.token1Price.times(token1.derivedETH as BigDecimal) // return token1 per our token * Eth per token 1
      }
      if (pair.token1 == token.id && pair.reserveETH.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) {
        let token0 = Token.load(pair.token0)
        return pair.token0Price.times(token0.derivedETH as BigDecimal) // return token0 per our token * ETH per token 0
      }
    }
  }
  return ZERO_BD // nothing was found return 0
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD.
 * If both are, return average of two amounts
 * If neither is, return 0
 */
export function getTrackedVolumeUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token,
  pair: Pair
): BigDecimal {
  let bundle = Bundle.load('1')
  let price0 = token0.derivedETH.times(bundle.ethPrice)
  let price1 = token1.derivedETH.times(bundle.ethPrice)

  // dont count tracked volume on these pairs - usually rebass tokens
  if (UNTRACKED_PAIRS.includes(pair.id)) {
    return ZERO_BD
  }

  // if less than 5 LPs, require high minimum reserve amount amount or return 0
  if (pair.liquidityProviderCount.lt(BigInt.fromI32(5))) {
    let reserve0USD = pair.reserve0.times(price0)
    let reserve1USD = pair.reserve1.times(price1)
    if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
      if (reserve0USD.plus(reserve1USD).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
    if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
      if (reserve0USD.times(BigDecimal.fromString('2')).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
    if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
      if (reserve1USD.times(BigDecimal.fromString('2')).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
  }

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0
      .times(price0)
      .plus(tokenAmount1.times(price1))
      .div(BigDecimal.fromString('2'))
  }

  // take full value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0)
  }

  // take full value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1)
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export function getTrackedLiquidityUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let bundle = Bundle.load('1')
  let price0 = token0.derivedETH.times(bundle.ethPrice)
  let price1 = token1.derivedETH.times(bundle.ethPrice)

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1))
  }

  // take double value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).times(BigDecimal.fromString('2'))
  }

  // take double value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1).times(BigDecimal.fromString('2'))
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD
}
