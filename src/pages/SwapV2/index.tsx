import { CurrencyAmount, JSBI, Token, Percent } from '@dynamic-amm/sdk'
import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ArrowDown, AlertTriangle } from 'react-feather'
import { Text, Flex } from 'rebass'
import styled, { ThemeContext } from 'styled-components'
import { RouteComponentProps } from 'react-router-dom'
import { t, Trans } from '@lingui/macro'

import AddressInputPanel from '../../components/AddressInputPanel'
import { ButtonError, ButtonLight, ButtonPrimary, ButtonConfirmed } from '../../components/Button'
import Card, { GreyCard } from '../../components/Card'
import Column, { AutoColumn } from '../../components/Column'
import ConfirmSwapModal from '../../components/swapv2/ConfirmSwapModal'
import CurrencyInputPanel from '../../components/CurrencyInputPanel'
import { AutoRow, RowBetween } from '../../components/Row'
import AdvancedSwapDetailsDropdown from '../../components/swapv2/AdvancedSwapDetailsDropdown'
import {
  ArrowWrapper,
  BottomGrouping,
  Dots,
  SwapCallbackError,
  SwapFormActions,
  Wrapper,
  KyberDmmOutput,
  CompareDexOuput,
  KyberTag
} from '../../components/swapv2/styleds'
import TokenWarningModal from '../../components/TokenWarningModal'
import ProgressSteps from '../../components/ProgressSteps'
import { SwitchLocaleLink } from 'components/SwitchLocaleLink'
import { INITIAL_ALLOWED_SLIPPAGE } from '../../constants'
import { useActiveWeb3React } from '../../hooks'
import { useCurrency, useAllTokens } from '../../hooks/Tokens'
import { ApprovalState, useApproveCallbackFromTradeV2 } from '../../hooks/useApproveCallback'
import useWrapCallback, { WrapType } from '../../hooks/useWrapCallback'
import { useToggleSettingsMenu, useWalletModalToggle } from '../../state/application/hooks'
import { Field } from '../../state/swap/actions'
import { useDefaultsFromURLSearch, useSwapActionHandlers, useSwapState } from '../../state/swap/hooks'
import { useDerivedSwapInfoV2 } from '../../state/swap/useAggregator'
import { useExpertModeManager, useUserSlippageTolerance } from '../../state/user/hooks'
import { LinkStyledButton, TYPE } from '../../theme'
import { maxAmountSpend } from '../../utils/maxAmountSpend'
import AppBody from '../AppBody'
import { ClickableText } from '../Pool/styleds'
import Loader from '../../components/Loader'
import SwapIcon from '../../assets/svg/swap.svg'
import { Aggregator } from '../../utils/aggregator'
import { useSwapV2Callback } from '../../hooks/useSwapV2Callback'
import Routing from '../../components/swapv2/Routing'
import RefreshButton from '../../components/swapv2/RefreshButton'
import TradeTypeSelection from 'components/swapv2/TradeTypeSelection'
import {
  PageWrapper,
  Container,
  AggregatorStatsContainer,
  AggregatorStatsItem,
  AggregatorStatsItemTitle,
  AggregatorStatsItemValue
} from 'components/swapv2/styleds'
import useAggregatorVolume from 'hooks/useAggregatorVolume'
import { formattedNum } from 'utils'
import TotalTradingVolume from 'assets/svg/total_trade_volume.svg'
import TradingVolume24h from 'assets/svg/24h_trade_volume.svg'
import TransactionSettings from 'components/TransactionSettings'
import { formatBigLiquidity } from 'utils/formatBalance'
import { MouseoverTooltip } from 'components/Tooltip'

const AppBodyWrapped = styled(AppBody)`
  box-shadow: 0px 4px 16px rgba(0, 0, 0, 0.04);
  z-index: 1;
`

export default function Swap({ history }: RouteComponentProps) {
  const loadedUrlParams = useDefaultsFromURLSearch()

  // token warning stuff
  const [loadedInputCurrency, loadedOutputCurrency] = [
    useCurrency(loadedUrlParams?.inputCurrencyId),
    useCurrency(loadedUrlParams?.outputCurrencyId)
  ]

  const [dismissTokenWarning, setDismissTokenWarning] = useState<boolean>(false)
  const urlLoadedTokens: Token[] = useMemo(
    () => [loadedInputCurrency, loadedOutputCurrency]?.filter((c): c is Token => c instanceof Token) ?? [],
    [loadedInputCurrency, loadedOutputCurrency]
  )
  const handleConfirmTokenWarning = useCallback(() => {
    setDismissTokenWarning(true)
  }, [])

  // dismiss warning if all imported tokens are in active lists
  const defaultTokens = useAllTokens()
  const importTokensNotInDefault =
    urlLoadedTokens &&
    urlLoadedTokens.filter((token: Token) => {
      return !Boolean(token.address in defaultTokens)
    })

  const { account } = useActiveWeb3React()
  const theme = useContext(ThemeContext)

  // toggle wallet when disconnected
  const toggleWalletModal = useWalletModalToggle()

  // for expert mode
  const toggleSettings = useToggleSettingsMenu()
  const [isExpertMode] = useExpertModeManager()

  // get custom setting values for user
  const [allowedSlippage] = useUserSlippageTolerance()

  // swap state
  const { independentField, typedValue, recipient } = useSwapState()

  const {
    v2Trade,
    currencyBalances,
    parsedAmount,
    currencies,
    inputError: swapInputError,
    tradeComparer,
    onRefresh
  } = useDerivedSwapInfoV2()
  const { wrapType, execute: onWrap, inputError: wrapInputError } = useWrapCallback(
    currencies[Field.INPUT],
    currencies[Field.OUTPUT],
    typedValue
  )
  const showWrap: boolean = wrapType !== WrapType.NOT_APPLICABLE
  const trade = showWrap ? undefined : v2Trade

  const parsedAmounts = showWrap
    ? {
        [Field.INPUT]: parsedAmount,
        [Field.OUTPUT]: parsedAmount
      }
    : {
        [Field.INPUT]: independentField === Field.INPUT ? parsedAmount : trade?.inputAmount,
        [Field.OUTPUT]: independentField === Field.OUTPUT ? parsedAmount : trade?.outputAmount
      }

  const { onSwitchTokensV2, onCurrencySelection, onUserInput, onChangeRecipient } = useSwapActionHandlers()
  const isValid = !swapInputError
  const dependentField: Field = independentField === Field.INPUT ? Field.OUTPUT : Field.INPUT

  const handleTypeInput = useCallback(
    (value: string) => {
      onUserInput(Field.INPUT, value)
    },
    [onUserInput]
  )
  const handleTypeOutput = useCallback((): void => {
    // ...
  }, [])

  // reset if they close warning without tokens in params
  const handleDismissTokenWarning = useCallback(() => {
    setDismissTokenWarning(true)
    history.push('/swapv2/')
  }, [history])

  // modal and loading
  const [{ showConfirm, tradeToConfirm, swapErrorMessage, attemptingTxn, txHash }, setSwapState] = useState<{
    showConfirm: boolean
    tradeToConfirm: Aggregator | undefined
    attemptingTxn: boolean
    swapErrorMessage: string | undefined
    txHash: string | undefined
  }>({
    showConfirm: false,
    tradeToConfirm: undefined,
    attemptingTxn: false,
    swapErrorMessage: undefined,
    txHash: undefined
  })

  const formattedAmounts = {
    [independentField]: typedValue,
    [dependentField]: showWrap
      ? parsedAmounts[independentField]?.toExact() ?? ''
      : parsedAmounts[dependentField]?.toSignificant(6) ?? ''
  }

  const userHasSpecifiedInputOutput = Boolean(
    currencies[Field.INPUT] && currencies[Field.OUTPUT] && parsedAmounts[independentField]?.greaterThan(JSBI.BigInt(0))
  )
  const noRoute = !trade?.swaps?.length

  // check whether the user has approved the router on the input token
  const [approval, approveCallback] = useApproveCallbackFromTradeV2(trade, allowedSlippage)

  // check if user has gone through approval process, used to show two step buttons, reset on token change
  const [approvalSubmitted, setApprovalSubmitted] = useState<boolean>(false)

  // mark when a user has submitted an approval, reset onTokenSelection for input field
  useEffect(() => {
    if (approval === ApprovalState.PENDING) {
      setApprovalSubmitted(true)
    }
  }, [approval, approvalSubmitted])

  const maxAmountInput: CurrencyAmount | undefined = maxAmountSpend(currencyBalances[Field.INPUT])

  // the callback to execute the swap
  const { callback: swapCallback, error: swapCallbackError } = useSwapV2Callback(trade, allowedSlippage, recipient)

  const handleSwap = useCallback(() => {
    if (!swapCallback) {
      return
    }
    setSwapState({ attemptingTxn: true, tradeToConfirm, showConfirm, swapErrorMessage: undefined, txHash: undefined })
    swapCallback()
      .then(hash => {
        setSwapState({ attemptingTxn: false, tradeToConfirm, showConfirm, swapErrorMessage: undefined, txHash: hash })
      })
      .catch(error => {
        setSwapState({
          attemptingTxn: false,
          tradeToConfirm,
          showConfirm,
          swapErrorMessage: error.message,
          txHash: undefined
        })
      })
  }, [tradeToConfirm, showConfirm, swapCallback])

  // show approve flow when: no error on inputs, not approved or pending, or approved in current session
  // never show if price impact is above threshold in non expert mode
  const showApproveFlow =
    !swapInputError &&
    (approval === ApprovalState.NOT_APPROVED ||
      approval === ApprovalState.PENDING ||
      (approvalSubmitted && approval === ApprovalState.APPROVED))

  const handleConfirmDismiss = useCallback(() => {
    setSwapState({ showConfirm: false, tradeToConfirm, attemptingTxn, swapErrorMessage, txHash })
    // if there was a tx hash, we want to clear the input
    if (txHash) {
      onUserInput(Field.INPUT, '')
    }
  }, [attemptingTxn, onUserInput, swapErrorMessage, tradeToConfirm, txHash])

  const handleAcceptChanges = useCallback(() => {
    setSwapState({ tradeToConfirm: trade, swapErrorMessage, txHash, attemptingTxn, showConfirm })
  }, [attemptingTxn, showConfirm, swapErrorMessage, trade, txHash])

  const handleInputSelect = useCallback(
    inputCurrency => {
      setApprovalSubmitted(false) // reset 2 step UI for approvals
      onCurrencySelection(Field.INPUT, inputCurrency)
    },
    [onCurrencySelection]
  )

  const handleMaxInput = useCallback(() => {
    maxAmountInput && onUserInput(Field.INPUT, maxAmountInput.toExact())
  }, [maxAmountInput, onUserInput])

  const handleOutputSelect = useCallback(outputCurrency => onCurrencySelection(Field.OUTPUT, outputCurrency), [
    onCurrencySelection
  ])

  const isLoading =
    (!currencyBalances[Field.INPUT] || !currencyBalances[Field.OUTPUT]) && userHasSpecifiedInputOutput && !v2Trade

  const aggregatorVolume = useAggregatorVolume()

  const loss =
    trade?.amountInUsd && trade?.amountOutUsd
      ? (100 * (Number(trade.amountInUsd) - Number(trade.amountOutUsd))) / Number(trade.amountInUsd)
      : 0

  const lossFormat = loss > 0 ? `-${loss.toFixed(3)}%` : loss < 0 ? `+${Math.abs(loss).toFixed(3)}%` : ''

  const comparerLoss =
    tradeComparer?.amountInUsd && tradeComparer?.amountOutUsd
      ? (100 * (Number(tradeComparer.amountInUsd) - Number(tradeComparer.amountOutUsd))) /
        Number(tradeComparer.amountInUsd)
      : 0

  const comparerLossFormat =
    comparerLoss > 0 ? `-${comparerLoss.toFixed(3)}%` : comparerLoss < 0 ? `+${Math.abs(comparerLoss).toFixed(3)}%` : ''

  const minDisplayValue = new Percent(JSBI.BigInt(1), JSBI.BigInt(1e5))

  const displayOutput =
    parsedAmounts[Field.OUTPUT] && parsedAmounts[Field.OUTPUT]?.lessThan(minDisplayValue)
      ? '< 0.00001'
      : parsedAmounts[Field.OUTPUT]?.toSignificant(6)
  const displayComparerAmount =
    tradeComparer?.outputAmount && tradeComparer.outputAmount?.lessThan(minDisplayValue)
      ? '< 0.00001'
      : tradeComparer?.outputAmount?.toSignificant(6)

  return (
    <>
      <TokenWarningModal
        isOpen={importTokensNotInDefault.length > 0 && !dismissTokenWarning}
        tokens={importTokensNotInDefault}
        onConfirm={handleConfirmTokenWarning}
        onDismiss={handleDismissTokenWarning}
      />
      <PageWrapper>
        <AggregatorStatsContainer>
          <AggregatorStatsItem>
            <AggregatorStatsItemTitle>
              <img src={TotalTradingVolume} alt="Total trading volume" style={{ width: '24px', marginRight: '10px' }} />
              <Trans>Total Trading Volume:</Trans>
            </AggregatorStatsItemTitle>
            <AggregatorStatsItemValue>
              {aggregatorVolume ? formatBigLiquidity(aggregatorVolume.totalVolume, 2, true) : <Loader />}
            </AggregatorStatsItemValue>
          </AggregatorStatsItem>

          <AggregatorStatsItem>
            <AggregatorStatsItemTitle>
              <img src={TradingVolume24h} alt="24h trading volume" style={{ width: '24px', marginRight: '10px' }} />
              <Trans>24h Trading Volume</Trans>:
            </AggregatorStatsItemTitle>
            <AggregatorStatsItemValue>
              {aggregatorVolume ? formattedNum(aggregatorVolume.last24hVolume, true) : <Loader />}
            </AggregatorStatsItemValue>
          </AggregatorStatsItem>
        </AggregatorStatsContainer>

        <Container>
          <div>
            <AppBodyWrapped>
              <RowBetween mb={'16px'}>
                <TYPE.black color={theme.text1} fontSize={20} fontWeight={500}>{t`Swap`}</TYPE.black>
                <SwapFormActions>
                  <RefreshButton isConfirming={showConfirm} trade={trade} onClick={onRefresh} />
                  <TransactionSettings />
                </SwapFormActions>
              </RowBetween>

              <Wrapper id="swap-page">
                <ConfirmSwapModal
                  isOpen={showConfirm}
                  trade={trade}
                  originalTrade={tradeToConfirm}
                  onAcceptChanges={handleAcceptChanges}
                  attemptingTxn={attemptingTxn}
                  txHash={txHash}
                  recipient={recipient}
                  allowedSlippage={allowedSlippage}
                  onConfirm={handleSwap}
                  swapErrorMessage={swapErrorMessage}
                  onDismiss={handleConfirmDismiss}
                  tokenAddtoMetaMask={currencies[Field.OUTPUT]}
                />

                <Flex flexDirection="column" sx={{ gap: '0.5rem' }}>
                  <CurrencyInputPanel
                    label={independentField === Field.OUTPUT && !showWrap && trade ? t`From (estimated)` : t`From`}
                    value={formattedAmounts[Field.INPUT]}
                    positionMax="top"
                    showMaxButton
                    currency={currencies[Field.INPUT]}
                    onUserInput={handleTypeInput}
                    onMax={handleMaxInput}
                    onCurrencySelect={handleInputSelect}
                    otherCurrency={currencies[Field.OUTPUT]}
                    id="swap-currency-input"
                    showCommonBases={true}
                    estimatedUsd={trade?.amountInUsd ? `${formattedNum(trade.amountInUsd, true)}` : undefined}
                  />
                  <AutoColumn justify="space-between">
                    <AutoRow justify={isExpertMode ? 'space-between' : 'center'} style={{ padding: '0 1rem' }}>
                      <ArrowWrapper clickable>
                        <img
                          src={SwapIcon}
                          alt="SwapIcon"
                          width="22"
                          onClick={() => {
                            setApprovalSubmitted(false) // reset 2 step UI for approvals
                            onSwitchTokensV2()
                          }}
                        />
                      </ArrowWrapper>
                      {recipient === null && !showWrap && isExpertMode ? (
                        <LinkStyledButton id="add-recipient-button" onClick={() => onChangeRecipient('')}>
                          <Trans>+ Add a send (optional)</Trans>
                        </LinkStyledButton>
                      ) : null}
                    </AutoRow>
                  </AutoColumn>
                  <CurrencyInputPanel
                    disabledInput
                    value={' '}
                    onUserInput={handleTypeOutput}
                    label={independentField === Field.INPUT && !showWrap && trade ? 'To (estimated)' : 'To'}
                    showMaxButton={false}
                    currency={currencies[Field.OUTPUT]}
                    onCurrencySelect={handleOutputSelect}
                    otherCurrency={currencies[Field.INPUT]}
                    id="swap-currency-output"
                    showCommonBases={true}
                    customNode={
                      <>
                        <KyberDmmOutput>
                          <KyberTag>
                            {tradeComparer?.tradeSaved?.usd ? (
                              <Trans>Save {formattedNum(tradeComparer.tradeSaved.usd, true)}</Trans>
                            ) : (
                              'KyberDMM'
                            )}
                          </KyberTag>
                          <Text fontWeight="500" fontSize="1.5rem" marginTop="0.75rem" flex={1}>
                            {formattedAmounts[Field.OUTPUT] ? displayOutput : '0.0'}
                          </Text>
                          <Flex flexDirection="column" color={theme.subText} alignItems="end" width="fit-content">
                            <Text fontSize="10px" fontWeight="500">
                              KyberDMM
                            </Text>
                            <Text marginTop="0.5rem" fontSize="14px" fontWeight="500">
                              {lossFormat && !!trade?.amountOutUsd && (
                                <Flex alignItems="center">
                                  ~{formattedNum(trade.amountOutUsd, true)}
                                  <Flex
                                    marginLeft="0.25rem"
                                    sx={{ gap: '4px' }}
                                    color={loss > 10 ? theme.red1 : undefined}
                                    alignItems="center"
                                  >
                                    ({lossFormat})
                                    {loss > 10 && (
                                      <MouseoverTooltip text="High slippage! More than 10% drop">
                                        <AlertTriangle size={16} />
                                      </MouseoverTooltip>
                                    )}
                                  </Flex>
                                </Flex>
                              )}
                            </Text>
                          </Flex>
                        </KyberDmmOutput>
                        <CompareDexOuput>
                          <Text fontWeight="500" fontSize="1.5rem" color={theme.disableText} flex={1} overflow="hidden">
                            {tradeComparer?.outputAmount && tradeComparer?.outputAmount?.toExact() !== '0'
                              ? displayComparerAmount
                              : '0.0'}
                          </Text>
                          <Flex flexDirection="column" color={theme.disableText} alignItems="end" width="fit-content">
                            <Text fontSize="10px" fontWeight="500">
                              {!tradeComparer?.amountOutUsd ? '--' : tradeComparer.comparedDex.name}
                            </Text>
                            <Text marginTop="0.5rem" fontSize="14px" fontWeight="500">
                              {comparerLossFormat && !!tradeComparer?.amountOutUsd && (
                                <Flex alignItems="center">
                                  ~{formattedNum(tradeComparer.amountOutUsd, true)}{' '}
                                  <Flex
                                    marginLeft="0.25rem"
                                    sx={{ gap: '4px' }}
                                    color={comparerLoss > 10 ? theme.red1 : undefined}
                                    alignItems="center"
                                  >
                                    ({comparerLossFormat})
                                    {comparerLoss > 10 && (
                                      <MouseoverTooltip text="High slippage! More than 10% drop">
                                        <AlertTriangle size={16} />
                                      </MouseoverTooltip>
                                    )}
                                  </Flex>
                                </Flex>
                              )}
                            </Text>
                          </Flex>
                        </CompareDexOuput>
                      </>
                    }
                  />

                  {recipient !== null && !showWrap ? (
                    <>
                      <AutoRow justify="space-between" style={{ padding: '0 1rem' }}>
                        <ArrowWrapper clickable={false}>
                          <ArrowDown size="16" color={theme.text2} />
                        </ArrowWrapper>
                        <LinkStyledButton id="remove-recipient-button" onClick={() => onChangeRecipient(null)}>
                          <Trans>- Remove send</Trans>
                        </LinkStyledButton>
                      </AutoRow>
                      <AddressInputPanel id="recipient" value={recipient} onChange={onChangeRecipient} />
                    </>
                  ) : null}

                  {showWrap ? null : (
                    <Card padding={'0 .75rem 0 .25rem'} borderRadius={'20px'}>
                      <AutoColumn gap="4px">
                        {allowedSlippage !== INITIAL_ALLOWED_SLIPPAGE && (
                          <div style={{ alignItems: 'center', display: 'flex' }}>
                            <ClickableText fontWeight={500} fontSize={14} color={theme.text2} onClick={toggleSettings}>
                              <Trans>Slippage Tolerance:</Trans>&nbsp;
                            </ClickableText>
                            <ClickableText fontWeight={500} fontSize={14} color={theme.text2} onClick={toggleSettings}>
                              {allowedSlippage / 100}%
                            </ClickableText>
                          </div>
                        )}
                      </AutoColumn>
                    </Card>
                  )}
                </Flex>

                <TradeTypeSelection />

                <BottomGrouping>
                  {!account ? (
                    <ButtonLight onClick={toggleWalletModal}>
                      <Trans>Connect Wallet</Trans>
                    </ButtonLight>
                  ) : isLoading ? (
                    <GreyCard style={{ textAlign: 'center', borderRadius: '5.5px' }}>
                      <TYPE.main mb="4px">
                        <Dots>
                          <Trans>Calculating best route</Trans>
                        </Dots>
                      </TYPE.main>
                    </GreyCard>
                  ) : showWrap ? (
                    <ButtonPrimary disabled={Boolean(wrapInputError)} onClick={onWrap}>
                      {wrapInputError ??
                        (wrapType === WrapType.WRAP ? 'Wrap' : wrapType === WrapType.UNWRAP ? 'Unwrap' : null)}
                    </ButtonPrimary>
                  ) : noRoute && userHasSpecifiedInputOutput ? (
                    <GreyCard style={{ textAlign: 'center', borderRadius: '5.5px' }}>
                      <TYPE.main mb="4px">
                        <Trans>Insufficient liquidity for this trade.</Trans>
                      </TYPE.main>
                    </GreyCard>
                  ) : showApproveFlow ? (
                    <RowBetween>
                      <ButtonConfirmed
                        onClick={approveCallback}
                        disabled={approval !== ApprovalState.NOT_APPROVED || approvalSubmitted}
                        width="48%"
                        altDisabledStyle={approval === ApprovalState.PENDING} // show solid button while waiting
                        confirmed={approval === ApprovalState.APPROVED}
                      >
                        {approval === ApprovalState.PENDING ? (
                          <AutoRow gap="6px" justify="center">
                            <Trans>Approving</Trans> <Loader stroke="white" />
                          </AutoRow>
                        ) : approvalSubmitted && approval === ApprovalState.APPROVED ? (
                          t`Approved`
                        ) : (
                          t`Approve ${currencies[Field.INPUT]?.symbol}`
                        )}
                      </ButtonConfirmed>
                      <ButtonError
                        onClick={() => {
                          if (isExpertMode) {
                            handleSwap()
                          } else {
                            setSwapState({
                              tradeToConfirm: trade,
                              attemptingTxn: false,
                              swapErrorMessage: undefined,
                              showConfirm: true,
                              txHash: undefined
                            })
                          }
                        }}
                        width="48%"
                        id="swap-button"
                        disabled={!isValid || approval !== ApprovalState.APPROVED}
                      >
                        <Text fontSize={16} fontWeight={500}>
                          {t`Swap`}
                        </Text>
                      </ButtonError>
                    </RowBetween>
                  ) : (
                    <ButtonError
                      onClick={() => {
                        if (isExpertMode) {
                          handleSwap()
                        } else {
                          setSwapState({
                            tradeToConfirm: trade,
                            attemptingTxn: false,
                            swapErrorMessage: undefined,
                            showConfirm: true,
                            txHash: undefined
                          })
                        }
                      }}
                      id="swap-button"
                      disabled={!isValid || !!swapCallbackError || approval !== ApprovalState.APPROVED}
                    >
                      <Text fontWeight={500}>
                        {swapInputError
                          ? swapInputError
                          : approval !== ApprovalState.APPROVED
                          ? t`Checking allowance...`
                          : t`Swap`}
                      </Text>
                    </ButtonError>
                  )}
                  {showApproveFlow && (
                    <Column style={{ marginTop: '1rem' }}>
                      <ProgressSteps steps={[approval === ApprovalState.APPROVED]} />
                    </Column>
                  )}
                  {isExpertMode && swapErrorMessage ? <SwapCallbackError error={swapErrorMessage} /> : null}
                </BottomGrouping>
              </Wrapper>
            </AppBodyWrapped>
            <AdvancedSwapDetailsDropdown trade={trade} />
            <SwitchLocaleLink />
          </div>
          <Routing trade={trade} currencies={currencies} parsedAmounts={parsedAmounts} />
        </Container>
      </PageWrapper>
    </>
  )
}
