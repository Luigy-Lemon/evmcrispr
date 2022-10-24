import {
  BindingsManager,
  BindingsSpace,
  EVMcrispr,
  NodeType,
  getDeepestNodeWithArgs,
  hasCommandsBlock,
  isProviderAction,
  parseScript,
} from '@1hive/evmcrispr';
import type {
  Action,
  CommandExpressionNode,
  ForwardOptions,
  Position,
} from '@1hive/evmcrispr';
import MonacoEditor, { useMonaco } from '@monaco-editor/react';
import { useChain, useSpringRef } from '@react-spring/web';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Spinner,
  VStack,
  useDisclosure,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import type { Connector } from 'wagmi';
import { useAccount, useConnect, useDisconnect, useProvider } from 'wagmi';
import { InjectedConnector } from 'wagmi/connectors/injected';
import type { providers } from 'ethers';

import { languages } from 'monaco-editor';
import type { IRange } from 'monaco-editor';

import { theme } from '../../editor/theme';
import {
  conf,
  contribution,
  createLanguage,
  getModulesKeywords,
} from '../../editor/evmcl';

import SelectWalletModal from '../../components/modal';
import FadeIn from '../../components/animations/fade-in';
import Footer from '../../components/footer';
import { terminalStoreActions, useTerminalStore } from './use-terminal-store';
import {
  buildCurrentArgCompletionItems,
  buildModuleCompletionItems,
  buildVarCompletionItems,
  runEagerExecutions,
  runLoadCommands,
} from '../../utils/autocompletion';
import { useDebounce } from '../../hooks/useDebounce';

// TODO: Migrate logic to evmcrispr
const executeActions = async (
  actions: Action[],
  connector: Connector,
  options?: ForwardOptions,
): Promise<providers.TransactionReceipt[]> => {
  const txs = [];

  if (!(connector instanceof InjectedConnector)) {
    throw new Error(
      `Provider action-returning commands are only supported by injected wallets (e.g. Metamask)`,
    );
  }

  for (const action of actions) {
    if (isProviderAction(action)) {
      const [chainParam] = action.params;

      await connector.switchChain(Number(chainParam.chainId));
    } else {
      const signer = await connector.getSigner();
      txs.push(
        await (
          await signer.sendTransaction({
            ...action,
            gasPrice: options?.gasPrice,
            gasLimit: options?.gasLimit,
          })
        ).wait(),
      );
    }
  }
  return txs;
};

const calculateCommandNameLength = (c: CommandExpressionNode) => {
  const offset = c.loc?.start.col ?? 0;
  // Take into account colon as well
  const moduleNameLength = (c.module ?? '').length;
  const colonLength = c.module ? 1 : 0;

  return offset + moduleNameLength + colonLength + c.name.length;
};

export const Terminal = () => {
  const monaco = useMonaco();
  const {
    bindingsCache,
    ipfsResolver,
    errors,
    isLoading,
    script,
    ast,
    currentModuleNames,
  } = useTerminalStore();
  const { data: account } = useAccount();
  const { activeConnector } = useConnect();
  const { disconnect } = useDisconnect();
  const provider = useProvider();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const terminalRef = useSpringRef();
  const buttonsRef = useSpringRef();
  const footerRef = useSpringRef();
  const [url] = useState('');

  const address = account?.address ?? '';
  const addressShortened = `${address.slice(0, 6)}..${address.slice(-4)}`;
  const forwardingText = `Forwarding from ${addressShortened}`;

  const debouncedScript = useDebounce(script, 200);

  useChain([terminalRef, buttonsRef, footerRef]);

  useEffect(() => {
    terminalStoreActions.processScript();
  }, [debouncedScript]);

  useEffect(() => {
    if (!monaco) {
      return;
    }
    const { commandKeywords, helperKeywords } = getModulesKeywords(
      currentModuleNames,
      bindingsCache,
    );

    const tokensProvider = monaco.languages.setMonarchTokensProvider(
      'evmcl',
      createLanguage(commandKeywords, helperKeywords),
    );

    return () => {
      tokensProvider.dispose();
    };
  }, [monaco, currentModuleNames, bindingsCache]);

  useEffect(() => {
    if (!monaco || !provider) {
      return;
    }
    const completionProvider = monaco.languages.registerCompletionItemProvider(
      'evmcl',
      {
        provideCompletionItems: async (model, currPos) => {
          const currentLineContent = model.getLineContent(currPos.lineNumber);
          const { startColumn, endColumn } =
            model.getWordUntilPosition(currPos);
          const range: IRange = {
            startLineNumber: currPos.lineNumber,
            endLineNumber: currPos.lineNumber,
            startColumn: startColumn,
            // If word exists retrieve the end column of the whole word
            endColumn: model.getWordAtPosition(currPos)?.endColumn ?? endColumn,
          };
          // Monaco editor positions start at 1
          const calibratedCurrPos: Position = {
            col: currPos.column - 1,
            line: currPos.lineNumber,
          };
          const eagerBindingsManager = new BindingsManager();

          if (!ast) {
            return;
          }

          const { ast: currentLineAST } = parseScript(
            [
              /**
               * Add previous lines to keep the correct
               * current line location
               */
              ...Array(currPos.lineNumber - 1).map(() => ''),
              currentLineContent,
            ].join('\n'),
          );

          const currentCommandNode = currentLineAST.getCommandAtLine(
            currPos.lineNumber,
          );
          // TODO: Maybe we should
          const { arg: currentArg } = currentCommandNode
            ? getDeepestNodeWithArgs(currentCommandNode, calibratedCurrPos)
            : { arg: undefined };

          if (
            currentCommandNode &&
            currentArg &&
            currentArg.type === NodeType.StringLiteral
          ) {
            return {
              suggestions: [],
            };
          }

          let contextModuleName = 'std';
          // Get command nodes until caret position
          const commandNodes: CommandExpressionNode[] = ast
            .getCommandsUntilLine(calibratedCurrPos.line - 1, ['load', 'set'])
            /**
             * Filter out any command with a commands block that doesn't
             * contain the current caret
             */
            .filter((c) => {
              const itHasCommandsBlock = hasCommandsBlock(c);
              const loc = c.loc;
              const currentLine = calibratedCurrPos.line;
              if (
                !itHasCommandsBlock ||
                (itHasCommandsBlock &&
                  loc &&
                  currentLine >= loc.start.line &&
                  currentLine <= loc.end.line)
              ) {
                if (itHasCommandsBlock) {
                  contextModuleName = c.module ?? contextModuleName;
                }
                return true;
              }

              return false;
            });

          // Build module bindings
          await runLoadCommands(
            commandNodes,
            eagerBindingsManager,
            bindingsCache,
            { provider, ipfsResolver },
            calibratedCurrPos,
          );

          const filteredCommandNodes = commandNodes
            // Filter out load command nodes previously resolved
            .filter((c) => c.name !== 'load');

          await runEagerExecutions(
            currentCommandNode
              ? [...filteredCommandNodes, currentCommandNode]
              : filteredCommandNodes,
            eagerBindingsManager,
            bindingsCache,
            { provider, ipfsResolver },
            calibratedCurrPos,
          );

          // Build module completion items
          const { commandCompletionItems, helperCompletionItems } =
            buildModuleCompletionItems(eagerBindingsManager, range);
          const emptyLine = !currentLineContent.trim().length;

          const displayCommandSuggestions =
            emptyLine ||
            // Check if caret position is within the command name location
            (!!currentCommandNode?.loc &&
              calibratedCurrPos.col >= currentCommandNode.loc.start.col &&
              calibratedCurrPos.col <=
                calculateCommandNameLength(currentCommandNode));

          if (displayCommandSuggestions) {
            return {
              suggestions: commandCompletionItems,
            };
          }

          const variableCompletionItems = buildVarCompletionItems(
            eagerBindingsManager,
            range,
            calibratedCurrPos,
            currentCommandNode,
          );
          let currentArgCompletionItems: languages.CompletionItem[] = [];

          if (currentCommandNode) {
            currentArgCompletionItems = buildCurrentArgCompletionItems(
              eagerBindingsManager,
              currentCommandNode,
              contextModuleName,
              range,
              calibratedCurrPos,
            );
          }
          // TODO: Only display identifiers when located inside a
          // node with args which may not be completed , e.g.
          // @helper(a, <here>).
          // Need to update parser to support incorrect expressions
          // and add <empty-error> on those situations
          else {
            currentArgCompletionItems = eagerBindingsManager
              .getAllBindingIdentifiers({
                spaceFilters: [BindingsSpace.ADDR],
              })
              .map<languages.CompletionItem>((identifier) => ({
                insertText: identifier,
                label: identifier,
                kind: languages.CompletionItemKind.Field,
                range,
                sortText: '1',
              }));
          }

          return {
            suggestions: [
              ...currentArgCompletionItems,
              ...helperCompletionItems,
              ...variableCompletionItems,
            ],
          };
        },
      },
    );

    return () => {
      completionProvider.dispose();
    };
  }, [bindingsCache, monaco, provider, ipfsResolver, ast]);

  async function onDisconnect() {
    terminalStoreActions.errors([]);
    disconnect();
  }

  async function onExecute() {
    terminalStoreActions.errors([]);
    terminalStoreActions.isLoading(true);

    try {
      const signer = await activeConnector?.getSigner();
      if (!activeConnector || signer === undefined || signer === null)
        throw new Error('Account not connected');

      const { ast, errors } = parseScript(script);

      if (errors.length) {
        terminalStoreActions.isLoading(false);
        terminalStoreActions.errors(errors);
        return;
      }
      const actions = await new EVMcrispr(ast, signer).interpret();

      await executeActions(actions, activeConnector, { gasLimit: 10_000_000 });

      // TODO: adapt to cas11 changes
      // const chainId = (await signer.provider?.getNetwork())?.chainId;
      // setUrl(`https://${client(chainId)}/#/${connectedDAO.kernel.address}/${}`);
    } catch (err: any) {
      const e = err as Error;
      console.error(e);
      if (
        e.message.startsWith('transaction failed') &&
        /^0x[0-9a-f]{64}$/.test(e.message.split('"')[1])
      ) {
        terminalStoreActions.errors([
          `Transaction failed, watch in block explorer ${
            e.message.split('"')[1]
          }`,
        ]);
      } else {
        terminalStoreActions.errors([e.message]);
      }
    } finally {
      terminalStoreActions.isLoading(false);
    }
  }

  return (
    <>
      <Box maxWidth="956px" margin="0 auto" my={16}>
        <FadeIn componentRef={terminalRef}>
          <MonacoEditor
            height="50vh"
            theme="theme"
            language="evmcl"
            value={script}
            onChange={(str, ev) => {
              terminalStoreActions.script(str ?? '');
              const change = ev.changes[0];
              const startLineNumber = change.range.startLineNumber;
              const newLine = change.text
                ? change.text.split('\n').length +
                  startLineNumber -
                  // Substract current line
                  1
                : startLineNumber;
              terminalStoreActions.updateCurrentLine(newLine);
            }}
            beforeMount={(monaco) => {
              monaco.editor.defineTheme('theme', theme);
              monaco.languages.register(contribution);
              monaco.languages.setLanguageConfiguration('evmcl', conf);
            }}
            onMount={(editor) => {
              editor.setPosition({ lineNumber: 10000, column: 0 });
              editor.focus();
            }}
            options={{
              fontSize: 22,
              fontFamily: 'Ubuntu Mono',
              detectIndentation: false,
              quickSuggestionsDelay: 100,
              tabSize: 2,
              language: 'evmcl',
              minimap: {
                enabled: false,
              },
              scrollbar: {
                useShadows: false,
                verticalScrollbarSize: 7,
                vertical: 'hidden',
              },
            }}
          />
        </FadeIn>
        <FadeIn componentRef={buttonsRef}>
          <VStack mt={3} alignItems="flex-end" gap={3} pr={{ base: 6, lg: 0 }}>
            {!address ? (
              <Button variant="lime" onClick={onOpen}>
                Connect
              </Button>
            ) : (
              <>
                {url ? (
                  <Button
                    variant="warning"
                    onClick={() => window.open(url, '_blank')}
                  >
                    Go to vote
                  </Button>
                ) : null}

                <Button variant="lime" onClick={onExecute} disabled={isLoading}>
                  {isLoading ? (
                    <Box>
                      <Spinner verticalAlign="middle" /> {forwardingText}
                    </Box>
                  ) : (
                    forwardingText
                  )}
                </Button>
                <Button
                  variant="link"
                  color="white"
                  onClick={onDisconnect}
                  size="sm"
                >
                  Disconnect
                </Button>
              </>
            )}

            {errors ? (
              <Box justifyContent="left">
                {errors.map((e, index) => (
                  <Alert key={index} status="error">
                    <AlertIcon />
                    <AlertDescription>{e}</AlertDescription>
                  </Alert>
                ))}
              </Box>
            ) : null}
          </VStack>
        </FadeIn>
      </Box>
      <FadeIn componentRef={footerRef}>
        <Footer />
      </FadeIn>
      <SelectWalletModal isOpen={isOpen} closeModal={onClose} />
    </>
  );
};
