import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { LAMPORTS_PER_SOL, PublicKey, Transaction, SystemProgram, Connection } from '@solana/web3.js';
import { Link } from 'wouter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Square, Activity, Terminal, Rocket, Zap, History, TrendingUp, AlertTriangle, Wallet, Cpu, Settings, ChevronDown, Lightbulb, User, RotateCcw, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getUserStats, getGameHistory, createGame, updateUserConfig, getUserProfile, getWithdrawalRequests, submitWithdrawal, type CreateGameRequest, type WithdrawalRequest } from '@/lib/api';
import { 
  createInitialState, 
  processRoundResult, 
  generateCrashPoint,
  type ScriptState 
} from '@/lib/nubs27-script';
import { Game } from '@shared/schema';
import { VerificationPanel } from '@/components/provably-fair/VerificationPanel';

export default function CrashGame() {
  const queryClient = useQueryClient();
  
  const { data: userStats, isLoading } = useQuery({
    queryKey: ['userStats'],
    queryFn: getUserStats,
    refetchOnWindowFocus: false
  });

  const { data: gameHistory = [] } = useQuery({
    queryKey: ['gameHistory'],
    queryFn: () => getGameHistory(50),
    refetchOnWindowFocus: false
  });

  const { data: withdrawalRequests = [] } = useQuery({
    queryKey: ['withdrawalRequests'],
    queryFn: getWithdrawalRequests,
    refetchOnWindowFocus: false
  });

  const createGameMutation = useMutation({
    mutationFn: createGame,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userStats'] });
      queryClient.invalidateQueries({ queryKey: ['gameHistory'] });
    }
  });

  const updateConfigMutation = useMutation({
    mutationFn: updateUserConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userStats'] });
    }
  });

  const [multiplier, setMultiplier] = useState(1.00);
  const [gameState, setGameState] = useState<'IDLE' | 'RUNNING' | 'CRASHED'>('IDLE');
  const [logs, setLogs] = useState<string[]>(['[SYSTEM] SOLSTAx Online. Smart Script Loaded.', '[SYSTEM] Soliix Coins Mode Active']);
  
  const [mode, setMode] = useState<'Manual' | 'Auto'>('Manual');
  const [manualBet, setManualBet] = useState(0.0001);
  const [manualTarget, setManualTarget] = useState(2.0);
  const [baseBet, setBaseBet] = useState(0.0001);
  const [stopLoss, setStopLoss] = useState(10);
  const [scriptState, setScriptState] = useState<ScriptState | null>(null);
  
  // Custom formula settings
  const [targetMultiplier, setTargetMultiplier] = useState(2.0);
  const [betStrategy, setBetStrategy] = useState<'flat' | 'martingale' | 'fibonacci' | 'custom'>('martingale');
  const [onWinAction, setOnWinAction] = useState<'reset' | 'increase' | 'same'>('reset');
  const [onWinPercent, setOnWinPercent] = useState(0);
  const [onLossAction, setOnLossAction] = useState<'martingale' | 'fibonacci' | 'increase' | 'same'>('martingale');
  const [onLossMultiplier, setOnLossMultiplier] = useState(2.0);
  const [maxBetPercent, setMaxBetPercent] = useState(10);
  const [usePatternDetection, setUsePatternDetection] = useState(true);
  const [activeBet, setActiveBet] = useState(0);
  const [hasCashedOut, setHasCashedOut] = useState(false);
  const [cashedOutPercent, setCashedOutPercent] = useState(0);
  
  // Multi-target system
  const [multiTargets, setMultiTargets] = useState<number[]>([2.0, 2.5, 3.0]);
  const [multiTargetEnabled, setMultiTargetEnabled] = useState(false);
  const [targetStrategy, setTargetStrategy] = useState<'cycle' | 'random' | 'weighted'>('cycle');
  const [newTargetInput, setNewTargetInput] = useState('');
  const targetIndexRef = useRef(0);
  
  // Quick bet presets (editable)
  const [quickBets, setQuickBets] = useState<number[]>([0.001, 0.01, 0.1, 5]);
  const [editingQuickBet, setEditingQuickBet] = useState<number | null>(null);
  const [quickBetInput, setQuickBetInput] = useState('');
  
  const { publicKey, connected: walletConnected } = useWallet();
  const { connection } = useConnection();
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  
  // Game mode: demo = Soliix Coins (play money), real = Real SOL
  const [gameMode, setGameMode] = useState<'demo' | 'real'>('demo');
  const [realBalance, setRealBalance] = useState<number>(0);
  const [depositChecking, setDepositChecking] = useState(false);
  const [depositAmount, setDepositAmount] = useState('0.01');
  const [depositLoading, setDepositLoading] = useState(false);
  const VAULT_ADDRESS = 'H9ecbrX7Wawm1URVCWvvmUZFrWBnv5Zx1PnDzjb7DYbW';
  
  // Coin packs for purchasing Soliix Coins
  const [showCoinPacks, setShowCoinPacks] = useState(false);
  const [coinPackLoading, setCoinPackLoading] = useState<string | null>(null);
  const coinPacks = [
    { id: 'pack_starter', name: 'Starter Pack', coins: 10, price: 499, popular: false },
    { id: 'pack_value', name: 'Value Pack', coins: 50, price: 1999, popular: true },
    { id: 'pack_pro', name: 'Pro Pack', coins: 150, price: 4999, popular: false },
    { id: 'pack_whale', name: 'Whale Pack', coins: 500, price: 14999, popular: false },
  ];
  
  const { sendTransaction, signTransaction } = useWallet();
  
  // Fetch real wallet balance via server-side API (avoids browser RPC blocks)
  useEffect(() => {
    let isMounted = true;
    let retryCount = 0;
    const maxRetries = 3;
    
    const fetchBalance = async () => {
      if (walletConnected && publicKey) {
        if (isMounted) {
          setBalanceLoading(true);
          setBalanceError(null);
        }
        try {
          const response = await fetch(`/api/wallet/${publicKey.toString()}/balance`);
          const data = await response.json();
          
          if (response.ok && data.success && typeof data.balance === 'number') {
            if (isMounted) {
              setWalletBalance(data.balance);
              setBalanceError(null);
              retryCount = 0;
            }
          } else {
            throw new Error(data.error || data.details || 'Failed to fetch balance');
          }
        } catch (error: any) {
          console.error('Failed to fetch wallet balance:', error?.message || error);
          if (isMounted) {
            setBalanceError(error?.message || 'Network error');
            // Retry with exponential backoff
            if (retryCount < maxRetries) {
              retryCount++;
              setTimeout(fetchBalance, 2000 * retryCount);
            }
          }
        } finally {
          if (isMounted) setBalanceLoading(false);
        }
      } else {
        if (isMounted) {
          setWalletBalance(null);
          setBalanceError(null);
        }
      }
    };

    // Small delay to ensure wallet is ready
    const timeout = setTimeout(fetchBalance, 800);
    
    // Refresh balance every 15 seconds when wallet is connected
    const interval = setInterval(fetchBalance, 15000);
    return () => {
      isMounted = false;
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [walletConnected, publicKey]);
  
  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: getUserProfile,
    refetchOnWindowFocus: false
  });

  // Sync game mode and real balance from server
  useEffect(() => {
    if (userStats) {
      setGameMode(userStats.gameMode as 'demo' | 'real' || 'demo');
      setRealBalance(parseFloat(userStats.realBalance || '0'));
    }
  }, [userStats]);

  // Toggle game mode
  const toggleGameMode = async (newMode: 'demo' | 'real') => {
    try {
      const response = await fetch('/api/user/game-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameMode: newMode })
      });
      
      const data = await response.json();
      if (response.ok) {
        setGameMode(newMode);
        
        // Update real balance from response
        if (data.realBalance) {
          setRealBalance(parseFloat(data.realBalance));
        }
        
        // Reset script state with the new mode's balance, keeping current bet settings
        const newBalance = parseFloat(data.balance);
        const currentBet = Math.max(0.0001, manualBet); // Keep user's current bet
        
        // Clear saved session and create fresh state for new mode
        localStorage.removeItem('solstax_session');
        setScriptState(createInitialState(newBalance, currentBet));
        
        // Refresh user stats
        queryClient.invalidateQueries({ queryKey: ['userStats'] });
        
        setLogs(prev => [
          `[SYSTEM] Switched to ${newMode.toUpperCase()} mode`,
          `[BALANCE] ${newMode === 'real' ? 'Real SOL' : 'Soliix Coins'} balance: ${newBalance.toFixed(4)}`,
          ...prev
        ]);
      } else {
        setLogs(prev => [
          `[ERROR] ${data.error}`,
          `[INFO] Deposit SOL to: ${VAULT_ADDRESS}`,
          ...prev
        ]);
      }
    } catch (error) {
      setLogs(prev => [`[ERROR] Failed to switch game mode`, ...prev]);
    }
  };

  // Buy coin pack with Stripe
  const buyCoinPack = async (packId: string) => {
    setCoinPackLoading(packId);
    try {
      const response = await fetch('/api/coin-packs/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId })
      });
      
      const data = await response.json();
      if (response.ok && data.url) {
        window.location.href = data.url;
      } else {
        setLogs(prev => [`[ERROR] ${data.error || 'Failed to start checkout'}`, ...prev]);
      }
    } catch (error) {
      setLogs(prev => ['[ERROR] Failed to create checkout session', ...prev]);
    } finally {
      setCoinPackLoading(null);
    }
  };

  // Check for new deposits
  const checkDeposits = async () => {
    if (!walletConnected || !publicKey) {
      setLogs(prev => ['[ERROR] Connect wallet first to check deposits', ...prev]);
      return;
    }
    
    setDepositChecking(true);
    try {
      const response = await fetch('/api/deposits/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: publicKey.toString() })
      });
      
      const data = await response.json();
      if (response.ok) {
        setLogs(prev => [
          `[DEPOSIT] ${data.message}`,
          `[BALANCE] Real SOL: ${parseFloat(data.realBalance || 0).toFixed(4)}`,
          ...prev
        ]);
        queryClient.invalidateQueries({ queryKey: ['userStats'] });
        setRealBalance(parseFloat(data.realBalance || '0'));
      } else {
        setLogs(prev => [`[ERROR] ${data.error}`, ...prev]);
      }
    } catch (error) {
      setLogs(prev => ['[ERROR] Failed to check deposits', ...prev]);
    } finally {
      setDepositChecking(false);
    }
  };

  // Direct in-app deposit - sends SOL from wallet to vault and credits instantly
  const directDeposit = async () => {
    alert('Deposit button clicked! Amount: ' + depositAmount);
    console.log('[DEPOSIT DEBUG] Starting deposit...', { walletConnected, publicKey: publicKey?.toString(), sendTransaction: !!sendTransaction });
    setLogs(prev => ['[DEPOSIT] Button clicked, starting deposit process...', ...prev]);
    
    if (!walletConnected || !publicKey || !sendTransaction) {
      alert('Wallet not connected properly');
      setLogs(prev => ['[ERROR] Connect wallet first to deposit', ...prev]);
      console.log('[DEPOSIT DEBUG] Wallet not connected or missing sendTransaction');
      return;
    }
    
    const amount = parseFloat(depositAmount);
    console.log('[DEPOSIT DEBUG] Amount:', amount);
    
    if (isNaN(amount) || amount < 0.0001) {
      setLogs(prev => ['[ERROR] Minimum deposit is 0.0001 SOL', ...prev]);
      return;
    }
    
    if (walletBalance !== null && amount > walletBalance) {
      setLogs(prev => [`[ERROR] Insufficient wallet balance (${walletBalance?.toFixed(4)} SOL)`, ...prev]);
      return;
    }
    
    setDepositLoading(true);
    setLogs(prev => [`[DEPOSIT] Initiating ${amount} SOL deposit...`, ...prev]);
    
    try {
      console.log('[DEPOSIT DEBUG] Creating transaction to vault:', VAULT_ADDRESS);
      const vaultPubkey = new PublicKey(VAULT_ADDRESS);
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      console.log('[DEPOSIT DEBUG] Lamports:', lamports);
      
      // Create transfer transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: vaultPubkey,
          lamports
        })
      );
      
      // Get blockhash from our backend (bypasses browser CORS issues)
      console.log('[DEPOSIT DEBUG] Getting blockhash from backend...');
      const blockhashRes = await fetch('/api/solana/blockhash');
      const blockhashData = await blockhashRes.json();
      
      if (!blockhashData.success) {
        throw new Error('Failed to get blockhash from server');
      }
      
      console.log('[DEPOSIT DEBUG] Got blockhash:', blockhashData.blockhash);
      transaction.recentBlockhash = blockhashData.blockhash;
      transaction.feePayer = publicKey;
      
      setLogs(prev => ['[DEPOSIT] Please approve transaction in your wallet...', ...prev]);
      
      // Send transaction using wallet adapter - this triggers the Phantom popup
      const signature = await sendTransaction(transaction, connection);
      
      setLogs(prev => [`[DEPOSIT] Transaction sent: ${signature.slice(0, 20)}...`, ...prev]);
      
      // Wait for confirmation using the wallet adapter's connection
      setLogs(prev => ['[DEPOSIT] Waiting for confirmation...', ...prev]);
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash: blockhashData.blockhash,
        lastValidBlockHeight: blockhashData.lastValidBlockHeight
      }, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error('Transaction failed');
      }
      
      setLogs(prev => ['[DEPOSIT] Transaction confirmed! Crediting your account...', ...prev]);
      
      // Credit the deposit via backend
      const response = await fetch('/api/deposits/credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: publicKey.toString(),
          signature,
          amount: amount.toFixed(9),
          lamports
        })
      });
      
      const data = await response.json();
      if (response.ok) {
        setLogs(prev => [
          `[SUCCESS] Deposited ${amount} SOL! New balance: ${parseFloat(data.realBalance).toFixed(4)} SOL`,
          ...prev
        ]);
        queryClient.invalidateQueries({ queryKey: ['userStats'] });
        setRealBalance(parseFloat(data.realBalance || '0'));
        
        // Refresh wallet balance
        const balanceResponse = await fetch(`/api/wallet/${publicKey.toString()}/balance`);
        const balanceData = await balanceResponse.json();
        if (balanceData.success) {
          setWalletBalance(balanceData.balance);
        }
      } else {
        setLogs(prev => [`[ERROR] ${data.error}`, ...prev]);
      }
    } catch (error: any) {
      console.error('Deposit error:', error);
      if (error.message?.includes('User rejected')) {
        setLogs(prev => ['[CANCELLED] Deposit cancelled by user', ...prev]);
      } else {
        setLogs(prev => [`[ERROR] Deposit failed: ${error.message || 'Unknown error'}`, ...prev]);
      }
    } finally {
      setDepositLoading(false);
    }
  };

  const animationRef = useRef<number>(null);
  const startTimeRef = useRef<number>(0);
  const crashPointRef = useRef<number>(0);
  const isAutoRunning = useRef(false);
  const pendingLogsRef = useRef<string[]>([]);
  const pendingStateRef = useRef<ScriptState | null>(null);
  const pendingRefreshRef = useRef(false);
  const consecutiveLossesRef = useRef(0);
  const fibonacciSeqRef = useRef([1, 1]);
  const currentAutoBetRef = useRef(0);
  const initialLoadDoneRef = useRef(false);
  
  const stateRef = useRef({
      mode,
      manualBet,
      manualTarget,
      gameState,
      baseBet,
      scriptState,
      userStats,
      gameMode,
      realBalance
  });

  useEffect(() => {
      stateRef.current = { mode, manualBet, manualTarget, gameState, baseBet, scriptState, userStats, gameMode, realBalance };
  }, [mode, manualBet, manualTarget, gameState, baseBet, scriptState, userStats, gameMode, realBalance]);

  // Load saved session data from localStorage on mount (only once)
  useEffect(() => {
    if (userStats && !scriptState && !initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      
      const isReal = userStats.gameMode === 'real';
      const balance = isReal 
        ? parseFloat(userStats.realBalance || '0') 
        : parseFloat(userStats.balance);
      const rawBet = parseFloat(userStats.baseBet);
      const bet = Math.max(0.0001, rawBet); // Ensure minimum bet
      
      // Try to load saved session from localStorage
      const savedSession = localStorage.getItem('solstax_session');
      if (savedSession) {
        try {
          const parsed = JSON.parse(savedSession);
          // Update balance from database but keep session stats
          parsed.balance = balance;
          parsed.baseBet = bet;
          parsed.currentBet = Math.max(0.0001, parsed.currentBet || bet);
          parsed.maxBet = balance / 10;
          setScriptState(parsed);
        } catch (e) {
          // If parsing fails, create fresh state
          setScriptState(createInitialState(balance, bet));
        }
      } else {
        setScriptState(createInitialState(balance, bet));
      }
      
      // Only set bet values on initial load
      setBaseBet(bet);
      setManualBet(bet);
      setStopLoss(parseFloat(userStats.stopLoss));
    }
  }, [userStats]);

  // Save session data to localStorage whenever scriptState changes
  useEffect(() => {
    if (scriptState) {
      localStorage.setItem('solstax_session', JSON.stringify(scriptState));
    }
  }, [scriptState]);

  useEffect(() => {
    if (scriptState && baseBet !== scriptState.baseBet) {
      setScriptState(prev => prev ? { ...prev, baseBet, currentBet: baseBet } : null);
    }
  }, [baseBet]);

  useEffect(() => {
    if (userStats && baseBet > 0 && stopLoss > 0) {
      const timer = setTimeout(() => {
        updateConfigMutation.mutate({
          baseBet: baseBet.toString(),
          stopLoss: stopLoss.toString(),
          autoBetEnabled: mode === 'Auto'
        });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [baseBet, stopLoss, mode]);

  const getNextTarget = (): number => {
    if (!multiTargetEnabled || multiTargets.length === 0) {
      return targetMultiplier;
    }
    
    let selectedTarget: number;
    
    switch (targetStrategy) {
      case 'random':
        selectedTarget = multiTargets[Math.floor(Math.random() * multiTargets.length)];
        break;
      case 'weighted':
        const weights = multiTargets.map(t => 1 / t);
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let random = Math.random() * totalWeight;
        let weightIndex = 0;
        for (let i = 0; i < weights.length; i++) {
          random -= weights[i];
          if (random <= 0) {
            weightIndex = i;
            break;
          }
        }
        selectedTarget = multiTargets[weightIndex];
        break;
      case 'cycle':
      default:
        selectedTarget = multiTargets[targetIndexRef.current % multiTargets.length];
        targetIndexRef.current++;
        break;
    }
    
    setTargetMultiplier(selectedTarget);
    return selectedTarget;
  };

  const runGameLoop = () => {
    const now = Date.now();
    const elapsed = (now - startTimeRef.current) / 1000;

    // Slower animation: reaches 2x in ~4.6s, 10x in ~15s
    const currentM = Math.pow(Math.E, 0.15 * elapsed);

    if (currentM >= crashPointRef.current) {
        setGameState('CRASHED');
        setMultiplier(crashPointRef.current);
        
        // Show pending logs and apply pending state now that animation has reached crash point
        if (pendingLogsRef.current.length > 0) {
          setLogs(prev => [...pendingLogsRef.current, ...prev].slice(0, 100));
          pendingLogsRef.current = [];
        }
        if (pendingRefreshRef.current) {
          queryClient.invalidateQueries({ queryKey: ['userStats'] });
          queryClient.invalidateQueries({ queryKey: ['gameHistory'] });
          pendingRefreshRef.current = false;
        }
        
        const { mode: currentMode, scriptState: currentScript } = stateRef.current;
        
        if (currentMode === 'Auto' && isAutoRunning.current && currentScript) {
          if (currentScript.coinLost >= stopLoss) {
            setLogs(prev => ['[STOP LOSS] Maximum loss reached. Script terminated.', ...prev]);
            isAutoRunning.current = false;
            setTimeout(() => setGameState('IDLE'), 500);
          } else {
            setTimeout(() => {
              setGameState('IDLE');
              setTimeout(() => startGame(), 100);
            }, 700);
          }
        } else {
          setTimeout(() => setGameState('IDLE'), 1500);
        }
    } else {
        setMultiplier(currentM);
        animationRef.current = requestAnimationFrame(runGameLoop);
    }
  };

  const calculateAutoBet = () => {
    const maxBet = (scriptState?.balance || 0) * (maxBetPercent / 100);
    let nextBet = baseBet;
    
    if (betStrategy === 'flat') {
      nextBet = baseBet;
    } else if (betStrategy === 'martingale') {
      nextBet = baseBet * Math.pow(onLossMultiplier, consecutiveLossesRef.current);
    } else if (betStrategy === 'fibonacci') {
      const fibIndex = Math.min(consecutiveLossesRef.current, fibonacciSeqRef.current.length - 1);
      nextBet = baseBet * fibonacciSeqRef.current[fibIndex];
    } else if (betStrategy === 'custom') {
      if (consecutiveLossesRef.current > 0) {
        if (onLossAction === 'martingale') {
          nextBet = currentAutoBetRef.current * onLossMultiplier;
        } else if (onLossAction === 'increase') {
          nextBet = currentAutoBetRef.current * (1 + onLossMultiplier / 100);
        } else if (onLossAction === 'fibonacci') {
          const fibIndex = Math.min(consecutiveLossesRef.current, fibonacciSeqRef.current.length - 1);
          nextBet = baseBet * fibonacciSeqRef.current[fibIndex];
        } else {
          nextBet = currentAutoBetRef.current;
        }
      } else {
        nextBet = baseBet;
      }
    }
    
    return Math.min(nextBet, maxBet);
  };

  const startGame = async () => {
      if (!stateRef.current.scriptState) return;
      
      const { mode: currentMode, manualBet: currentBet, manualTarget: currentTarget, scriptState: currentScript, gameMode: currentGameMode } = stateRef.current;
      
      // Get the correct available balance based on game mode
      const availableBalance = currentGameMode === 'real' 
        ? (stateRef.current.realBalance || 0)
        : (currentScript?.balance || 0);
      
      const MIN_BET = 0.0001;
      
      let bet: number;
      if (currentMode === 'Auto') {
        bet = calculateAutoBet();
        currentAutoBetRef.current = bet;
      } else {
        bet = currentBet;
      }
      
      // Cap bet at available balance and enforce minimum
      bet = Math.min(bet, availableBalance);
      bet = Math.max(bet, MIN_BET);
      
      // Check if we have enough balance
      if (availableBalance < MIN_BET) {
        setLogs(prev => [
          `[ERROR] Insufficient balance. Need at least ${MIN_BET} SOL`,
          currentGameMode === 'real' 
            ? `[INFO] Current real balance: ${availableBalance.toFixed(6)} SOL. Deposit more to play.`
            : `[INFO] Current Soliix Coins: ${availableBalance.toFixed(4)}`,
          ...prev
        ]);
        if (isAutoRunning.current) {
          isAutoRunning.current = false;
          setLogs(prev => ['[SCRIPT] Auto betting stopped - insufficient funds.', ...prev]);
        }
        return;
      }
      
      const target = currentMode === 'Auto' 
        ? (multiTargetEnabled ? getNextTarget() : (usePatternDetection ? (currentScript?.currentMultiplier || targetMultiplier) : targetMultiplier))
        : currentTarget;
      
      setActiveBet(bet);
      setHasCashedOut(false);
      setCashedOutPercent(0);
      setGameState('RUNNING');
      setMultiplier(1.00);
      
      try {
        const gameResult = await createGame({
          bet: bet.toFixed(6),
          targetMultiplier: target.toFixed(2),
          mode: currentMode
        });
        
        const crashPoint = gameResult.provablyFair?.crashPoint || parseFloat(gameResult.crash);
        const won = gameResult.result === 'Won';
        const profit = parseFloat(gameResult.profit);
        
        crashPointRef.current = crashPoint;
        startTimeRef.current = Date.now();
        
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        animationRef.current = requestAnimationFrame(runGameLoop);
        
        if (currentScript) {
          const { state: newState, logs: scriptLogs } = processRoundResult(
            currentScript,
            crashPoint,
            bet,
            target
          );
          
          // Apply balance update immediately so it's in sync
          setScriptState(newState);
          
          // Build game log with crash info and bet details
          const gameLogs: string[] = [];
          gameLogs.push(`[CRASH] ${crashPoint.toFixed(2)}x | Bet: ${bet.toFixed(4)} | Target: ${target.toFixed(2)}x`);
          
          if (won) {
            gameLogs.push(`[WIN] +${profit.toFixed(4)} SOL`);
            // Reset loss tracking on win
            consecutiveLossesRef.current = 0;
            fibonacciSeqRef.current = [1, 1];
            
            // Apply on-win action
            if (onWinAction === 'reset') {
              currentAutoBetRef.current = baseBet;
            } else if (onWinAction === 'increase') {
              currentAutoBetRef.current = bet * (1 + onWinPercent / 100);
            }
          } else {
            gameLogs.push(`[LOSS] -${bet.toFixed(4)} SOL`);
            // Track consecutive losses
            consecutiveLossesRef.current++;
            
            // Extend fibonacci sequence if needed
            if (consecutiveLossesRef.current >= fibonacciSeqRef.current.length) {
              const len = fibonacciSeqRef.current.length;
              fibonacciSeqRef.current.push(fibonacciSeqRef.current[len - 1] + fibonacciSeqRef.current[len - 2]);
            }
            
            // Calculate next bet preview for martingale
            if (betStrategy === 'martingale') {
              const nextBet = baseBet * Math.pow(onLossMultiplier, consecutiveLossesRef.current);
              gameLogs.push(`[MARTINGALE] Next bet: ${nextBet.toFixed(4)} (${consecutiveLossesRef.current} losses)`);
            }
          }
          
          // Include pattern detection logs
          gameLogs.push(...scriptLogs);
          
          // Store logs to show when animation reaches crash point
          pendingLogsRef.current = gameLogs;
        }
        
        // Store refresh flag to trigger when animation finishes
        pendingRefreshRef.current = true;
        
      } catch (error: any) {
        setGameState('IDLE');
        setLogs(prev => [`[ERROR] ${error.message}`, ...prev]);
      }
  };

  const handleCashout = (percentage: number) => {
    if (gameState !== 'RUNNING' || hasCashedOut || !scriptState) return;
    
    // Calculate remaining percentage that can be cashed out
    const remainingPercent = 1 - cashedOutPercent;
    if (remainingPercent <= 0) return;
    
    // Calculate the actual percentage of the original bet to cash out
    const actualCashoutPercent = Math.min(percentage, remainingPercent);
    const cashoutAmount = activeBet * actualCashoutPercent;
    const profit = cashoutAmount * multiplier; // Return bet + profit at current multiplier
    
    const newCashedOutPercent = cashedOutPercent + actualCashoutPercent;
    setCashedOutPercent(newCashedOutPercent);
    
    // Only mark fully cashed out if we've cashed out 100%
    if (newCashedOutPercent >= 0.99) {
      setHasCashedOut(true);
    }
    
    setLogs(prev => [`[CASHOUT] ${(actualCashoutPercent * 100).toFixed(0)}% at ${multiplier.toFixed(2)}x | +${profit.toFixed(4)} SOL (${(newCashedOutPercent * 100).toFixed(0)}% total)`, ...prev]);
    
    // Update balance with the profit from this cashout
    const netProfit = cashoutAmount * (multiplier - 1);
    setScriptState(prev => prev ? { 
      ...prev, 
      balance: prev.balance + cashoutAmount + netProfit,
      profit: prev.profit + netProfit,
      wins: newCashedOutPercent >= 0.99 ? prev.wins + 1 : prev.wins
    } : null);
  };

  const handleManualBet = () => {
      startGame();
  };

  const toggleAutoBot = () => {
      if (isAutoRunning.current) {
          isAutoRunning.current = false;
          setLogs(prev => ['[SCRIPT] Auto betting terminated by operator.', ...prev]);
      } else {
          // Reset loss tracking when starting fresh
          consecutiveLossesRef.current = 0;
          fibonacciSeqRef.current = [1, 1];
          currentAutoBetRef.current = baseBet;
          
          isAutoRunning.current = true;
          setMode('Auto');
          setLogs(prev => [
            `[SCRIPT] Strategy: ${betStrategy.toUpperCase()} | Base: ${baseBet} | Target: ${targetMultiplier}x`,
            '[SCRIPT] Initializing Smart Script...',
            ...prev
          ]);
          startGame();
      }
  };

  if (isLoading || !userStats || !scriptState) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center cyber-grid">
        <div className="text-center">
          <div className="text-4xl font-display font-bold gradient-text animate-pulse mb-4">SOL/STAx</div>
          <div className="text-primary text-sm font-mono">Initializing neural network...</div>
        </div>
      </div>
    );
  }

  const balance = scriptState.balance;
  const winRate = scriptState.roundsPlayed > 0 
    ? ((scriptState.wins / scriptState.roundsPlayed) * 100).toFixed(1) 
    : "0.0";
  const netProfit = scriptState.profit.toFixed(2);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col overflow-hidden">
      {/* Scanline overlay */}
      <div className="fixed inset-0 scanline pointer-events-none z-50 opacity-50"></div>
      
      {/* Top Bar */}
      <header className="h-12 border-b border-border/50 bg-card/80 backdrop-blur-xl flex items-center justify-between px-2 lg:px-4 sticky top-0 z-40 neon-border">
        <div className="flex items-center gap-2 lg:gap-6">
          <div className="flex items-center gap-2 lg:gap-3">
            <div className="w-8 h-8 lg:w-10 lg:h-10 solana-gradient rounded-lg flex items-center justify-center box-glow">
              <Rocket className="w-4 h-4 lg:w-5 lg:h-5 text-white" />
            </div>
            <div>
              <h1 className="font-display font-black text-lg lg:text-2xl tracking-[0.15em] gradient-text">
                SOL/STAx
              </h1>
              <div className="hidden lg:block text-[10px] font-mono text-muted-foreground tracking-widest -mt-1">
                SOLANA CRASH PROTOCOL
              </div>
            </div>
          </div>
          
          {/* Desktop only: Mode toggle and balance display */}
          <div className="hidden lg:flex items-center gap-6">
            <div className="h-10 w-px bg-border/50"></div>
            
            {/* Mode Toggle */}
            <button
              onClick={() => toggleGameMode(gameMode === 'demo' ? 'real' : 'demo')}
              className={`px-3 py-2 rounded-lg font-mono text-sm transition-all ${
                gameMode === 'demo' 
                  ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30' 
                  : 'bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30'
              }`}
              data-testid="button-toggle-mode-desktop"
            >
              {gameMode === 'demo' ? 'SOLIIX COINS' : 'REAL SOL'}
            </button>
            
            {/* Balance Display */}
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground font-mono tracking-widest uppercase mb-1">
                {gameMode === 'demo' ? 'PLAY COINS' : 'BALANCE'}
              </span>
              <div className="flex items-center gap-3">
                <span className={`font-mono font-bold text-xl tabular-nums text-glow-sm ${gameMode === 'demo' ? 'text-yellow-400' : 'text-primary'}`}>
                  {gameMode === 'demo' 
                    ? parseFloat(userStats?.balance || '0.5').toFixed(2)
                    : realBalance.toFixed(4)
                  }
                </span>
                <span className={`text-muted-foreground/50 font-display text-xs ${gameMode === 'demo' ? 'text-yellow-400/50' : ''}`}>
                  {gameMode === 'demo' ? 'SC' : 'SOL'}
                </span>
              </div>
            </div>
            
            {/* Buy Coins Button (only in Soliix Coins mode) */}
            {gameMode === 'demo' && (
              <button
                onClick={() => setShowCoinPacks(true)}
                className="px-4 py-2 rounded-lg font-mono text-sm bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-all"
                data-testid="button-buy-coins-desktop"
              >
                + BUY COINS
              </button>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2 lg:gap-4">
          <div className="hidden lg:block">
            <VerificationPanel />
          </div>
          {/* Mobile: Big prominent wallet button */}
          <WalletMultiButton className="!bg-primary !border-2 !border-primary !font-display !tracking-wider !text-primary-foreground !h-9 !text-sm !px-4 lg:!bg-transparent lg:!border lg:!border-primary/30 lg:hover:!bg-primary/10 lg:!text-foreground lg:!h-8 lg:!text-xs lg:!px-3" />
          {walletConnected && <div className="hidden lg:block h-8 w-px bg-border"></div>}
          <Link href="/profile">
            <button className="flex items-center gap-2 hover:opacity-80 transition-opacity" data-testid="button-profile">
              <Avatar className="w-8 h-8 border border-primary/50">
                <AvatarImage src={profile?.avatarUrl || ''} />
                <AvatarFallback className="bg-muted text-xs font-display">
                  {profile?.displayName?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            </button>
          </Link>
        </div>
      </header>
      
      {/* Mobile Balance Bar - Below header */}
      <div className="lg:hidden flex items-center justify-between px-3 py-2 bg-card/90 border-b border-border/50">
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleGameMode(gameMode === 'demo' ? 'real' : 'demo')}
            className={`text-xs font-mono px-2 py-1 rounded transition-colors ${
              gameMode === 'demo' 
                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' 
                : 'bg-primary/20 text-primary border border-primary/30'
            }`}
            data-testid="button-toggle-mode-mobile"
          >
            {gameMode === 'demo' ? 'SOLIIX COINS' : 'REAL SOL'}
          </button>
          {gameMode === 'demo' && (
            <button
              onClick={() => setShowCoinPacks(true)}
              className="text-xs font-mono px-2 py-1 rounded bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors"
              data-testid="button-buy-coins-mobile"
            >
              + BUY
            </button>
          )}
        </div>
        <div className="text-right">
          <div className="text-[9px] text-muted-foreground font-mono">
            {gameMode === 'demo' ? 'PLAY COINS' : 'BALANCE'}
          </div>
          <div className={`font-mono font-bold text-lg ${gameMode === 'demo' ? 'text-yellow-400' : 'text-primary'}`}>
            {gameMode === 'demo' 
              ? `${parseFloat(userStats?.balance || '0.5').toFixed(2)} SC`
              : `${realBalance.toFixed(4)} SOL`
            }
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Sidebar Controls */}
        <div className="w-full lg:w-[380px] bg-sidebar/90 backdrop-blur border-r border-border/50 flex flex-col z-30">
          <Tabs value={mode} onValueChange={(v) => { if (!isAutoRunning.current) setMode(v as 'Manual' | 'Auto'); }} className="flex-1 flex flex-col">
            <div className="p-4 border-b border-border/50">
              <TabsList className="w-full grid grid-cols-2 bg-muted/50">
                <TabsTrigger value="Manual" disabled={isAutoRunning.current} className="font-display tracking-wider data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  MANUAL
                </TabsTrigger>
                <TabsTrigger value="Auto" disabled={isAutoRunning.current} className="font-display tracking-wider data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
                  SCRIPT
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="Manual" className="flex-1 p-4 flex flex-col gap-4 m-0 outline-none overflow-auto">
              {/* Session Reset Button */}
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirm('Reset all session data? This cannot be undone.')) {
                      localStorage.removeItem('solstax_session');
                      const bal = parseFloat(userStats?.balance || '0');
                      const bet = parseFloat(userStats?.baseBet || '0.1');
                      setScriptState(createInitialState(bal, bet));
                      setLogs(['[SYSTEM] Session data reset.', '[SYSTEM] SOLSTAx Online.']);
                    }
                  }}
                  className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive"
                  data-testid="button-reset-session"
                >
                  <RotateCcw className="w-3 h-3 mr-1" /> RESET SESSION
                </Button>
              </div>

              {/* Deposit Section - Only show in real mode or when wallet connected */}
              {walletConnected && (
                <div className={`p-4 rounded-lg border ${gameMode === 'real' ? 'bg-primary/10 border-primary/30 neon-border' : 'bg-muted/20 border-border/30'}`}>
                  <h3 className="text-xs font-display tracking-widest text-primary mb-3 flex items-center gap-2">
                    <Wallet className="w-4 h-4" /> DEPOSIT SOL
                  </h3>
                  <div className="space-y-3">
                    <div className="bg-background/50 rounded-lg p-3">
                      <div className="text-muted-foreground text-[10px] font-mono mb-1">VAULT ADDRESS</div>
                      <div className="flex items-center gap-2">
                        <code className="text-[10px] font-mono text-primary break-all flex-1">
                          {VAULT_ADDRESS}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(VAULT_ADDRESS);
                              setLogs(prev => ['[SYSTEM] Vault address copied to clipboard', ...prev]);
                              alert('Vault address copied!');
                            } catch (err) {
                              // Fallback for browsers that don't support clipboard API
                              const textArea = document.createElement('textarea');
                              textArea.value = VAULT_ADDRESS;
                              document.body.appendChild(textArea);
                              textArea.select();
                              document.execCommand('copy');
                              document.body.removeChild(textArea);
                              setLogs(prev => ['[SYSTEM] Vault address copied to clipboard', ...prev]);
                              alert('Vault address copied!');
                            }
                          }}
                          className="h-6 px-2 text-[10px]"
                          data-testid="button-copy-vault"
                        >
                          COPY
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 bg-background/50 rounded-lg p-3 text-center">
                        <div className="text-muted-foreground text-[10px] font-mono mb-1">REAL BALANCE</div>
                        <div className="text-lg font-bold text-primary font-mono">{realBalance.toFixed(4)} SOL</div>
                      </div>
                      <div className="flex-1 bg-background/50 rounded-lg p-3 text-center">
                        <div className="text-muted-foreground text-[10px] font-mono mb-1">WALLET</div>
                        <div className="text-lg font-bold text-cyan-400 font-mono">{walletBalance?.toFixed(4) || '—'} SOL</div>
                      </div>
                    </div>
                    
                    {/* Direct Deposit Form */}
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        className="flex-1 text-center font-mono bg-background/50 border-primary/30"
                        placeholder="Amount"
                        data-testid="input-deposit-amount"
                      />
                      <Button
                        onClick={() => {
                          if (!walletConnected) {
                            alert('Please connect your Phantom wallet first! Click "Select Wallet" button at the top.');
                            setLogs(prev => ['[ERROR] Please connect your wallet first using the "Select Wallet" button', ...prev]);
                            return;
                          }
                          directDeposit();
                        }}
                        disabled={depositLoading}
                        className="flex-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/50 font-bold"
                        data-testid="button-direct-deposit"
                      >
                        {depositLoading ? (
                          <span className="animate-pulse">Sending...</span>
                        ) : (
                          <>
                            <Zap className="w-4 h-4 mr-1" />
                            DEPOSIT
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-[10px] text-green-400/80 text-center font-medium">
                      Enter amount → Click Deposit → Approve in wallet → Instant credit!
                    </p>
                    
                    <div className="pt-2 border-t border-primary/20">
                      <Button
                        onClick={checkDeposits}
                        disabled={depositChecking}
                        variant="ghost"
                        className="w-full text-xs text-muted-foreground hover:text-primary"
                        data-testid="button-check-deposits"
                      >
                        {depositChecking ? (
                          <span className="animate-pulse">Checking...</span>
                        ) : (
                          <>
                            <RotateCcw className="w-3 h-3 mr-2" />
                            Check for External Deposits
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Withdrawal Section - Only show in real mode with balance */}
              {walletConnected && gameMode === 'real' && realBalance > 0 && (
                <div className="p-4 rounded-lg border bg-yellow-500/10 border-yellow-500/30">
                  <h3 className="text-xs font-display tracking-widest text-yellow-400 mb-3 flex items-center gap-2">
                    <Wallet className="w-4 h-4" /> CASH OUT
                  </h3>
                  <div className="space-y-3">
                    <div className="bg-background/50 rounded-lg p-3">
                      <div className="text-muted-foreground text-[10px] font-mono mb-1">AVAILABLE TO WITHDRAW</div>
                      <div className="text-lg font-bold text-yellow-400 font-mono">{realBalance.toFixed(4)} SOL</div>
                    </div>
                    <Button
                      onClick={async () => {
                        if (!publicKey) return;
                        const amount = prompt(`Enter amount to withdraw (max ${realBalance.toFixed(4)} SOL):`);
                        if (!amount) return;
                        const amountNum = parseFloat(amount);
                        if (isNaN(amountNum) || amountNum <= 0 || amountNum > realBalance) {
                          alert('Invalid amount');
                          return;
                        }
                        try {
                          const result = await submitWithdrawal(amountNum, publicKey.toBase58());
                          setLogs(prev => [`[SYSTEM] ${result.message}`, ...prev]);
                          alert(result.message);
                          queryClient.invalidateQueries({ queryKey: ['userStats'] });
                          queryClient.invalidateQueries({ queryKey: ['withdrawalRequests'] });
                        } catch (err: any) {
                          alert(err.message || 'Withdrawal request failed');
                        }
                      }}
                      className="w-full bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/50"
                      data-testid="button-request-withdrawal"
                    >
                      <Wallet className="w-4 h-4 mr-2" />
                      Request Withdrawal
                    </Button>
                    <p className="text-[10px] text-muted-foreground text-center">
                      Withdrawals require admin approval before processing
                    </p>
                    
                    {/* Pending Withdrawal Requests */}
                    {withdrawalRequests.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-yellow-500/20">
                        <div className="text-[10px] font-mono text-muted-foreground mb-2">YOUR REQUESTS</div>
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                          {withdrawalRequests.map((req: WithdrawalRequest) => (
                            <div 
                              key={req.id}
                              className={`p-2 rounded text-[10px] font-mono flex justify-between items-center ${
                                req.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400' :
                                req.status === 'approved' ? 'bg-blue-500/10 text-blue-400' :
                                req.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                                'bg-red-500/10 text-red-400'
                              }`}
                              data-testid={`withdrawal-request-${req.id}`}
                            >
                              <span>{parseFloat(req.amountSol).toFixed(4)} SOL</span>
                              <span className="uppercase">{req.status}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Recent Crashes */}
              <div className="bg-muted/20 p-4 rounded-lg border border-border/30">
                <h3 className="text-xs font-display tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-accent" /> RECENT CRASHES
                </h3>
                <div className="flex flex-wrap gap-2">
                  {gameHistory.slice(0, 10).map((game: Game, idx: number) => (
                    <div 
                      key={game.id}
                      className={`px-3 py-1.5 rounded-lg font-mono text-sm font-bold ${
                        parseFloat(game.crash) >= 10 ? 'bg-yellow-500/20 text-yellow-400' :
                        parseFloat(game.crash) >= 2 ? 'bg-green-500/20 text-green-400' : 
                        'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {parseFloat(game.crash).toFixed(2)}x
                    </div>
                  ))}
                  {gameHistory.length === 0 && (
                    <div className="text-muted-foreground text-sm">No games yet</div>
                  )}
                </div>
              </div>

              {/* Quick Tips */}
              <div className="bg-accent/5 p-4 rounded-lg border border-accent/20">
                <h3 className="text-xs font-display tracking-widest text-accent mb-3 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4" /> QUICK TIPS
                </h3>
                <ul className="space-y-2 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    <span>Start with small bets to understand the rhythm</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    <span>Cash out early - 1.5x-2x is safer than chasing high multipliers</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    <span>Set a stop-loss limit and stick to it</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    <span>Use SCRIPT mode for automated strategies</span>
                  </li>
                </ul>
              </div>

              {/* Mode Indicator */}
              <div className="mt-auto text-center py-3 bg-muted/10 rounded-lg">
                <div className="text-primary font-display tracking-widest text-sm">MANUAL MODE</div>
                <div className="text-[10px] text-muted-foreground">Place bets using controls below the multiplier</div>
              </div>
              </TabsContent>

            <TabsContent value="Auto" className="flex-1 p-4 flex flex-col gap-3 m-0 outline-none overflow-auto">
              {/* Script Status */}
              <div className="bg-accent/10 p-3 rounded-lg neon-border-magenta">
                <h3 className="text-[10px] font-display tracking-widest text-accent mb-2 flex items-center gap-2">
                  <Cpu className="w-3 h-3 neon-pulse" /> LIVE STATUS
                </h3>
                <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                  <div className="text-center">
                    <div className="text-muted-foreground text-[10px]">BET</div>
                    <div className="text-primary font-bold">{scriptState.currentBet.toFixed(4)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-muted-foreground text-[10px]">TARGET</div>
                    <div className="text-accent font-bold">
                      {multiTargetEnabled ? (
                        <span className="flex items-center justify-center gap-1">
                          {targetMultiplier.toFixed(2)}x
                          <span className="text-[8px] text-muted-foreground">/{multiTargets.length}</span>
                        </span>
                      ) : (
                        <span>{targetMultiplier.toFixed(2)}x</span>
                      )}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-muted-foreground text-[10px]">STRATEGY</div>
                    <div className="text-foreground font-bold capitalize">{betStrategy}</div>
                  </div>
                </div>
                {multiTargetEnabled && (
                  <div className="mt-2 pt-2 border-t border-accent/20">
                    <div className="text-[9px] text-muted-foreground mb-1">TARGETS: {targetStrategy.toUpperCase()}</div>
                    <div className="flex gap-1 flex-wrap">
                      {multiTargets.map((t, i) => (
                        <span 
                          key={i} 
                          className={`px-1.5 py-0.5 text-[9px] font-mono rounded ${
                            t === targetMultiplier ? 'bg-accent text-accent-foreground' : 'bg-muted/50 text-muted-foreground'
                          }`}
                        >
                          {t}x
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Pattern Matrix */}
              {usePatternDetection && (
                <div className="bg-muted/20 p-3 rounded-lg border border-border/30">
                  <h3 className="text-[10px] font-display tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
                    <TrendingUp className="w-3 h-3" /> PATTERN MATRIX
                  </h3>
                  <div className="grid grid-cols-4 gap-2 text-xs font-mono mb-2">
                    <div className="text-center p-1 bg-red-500/10 rounded">
                      <div className="text-red-400 text-[9px]">RED</div>
                      <div className={`font-bold ${scriptState.red > 3 ? 'text-red-500' : 'text-foreground'}`}>{scriptState.red}</div>
                    </div>
                    <div className="text-center p-1 bg-green-500/10 rounded">
                      <div className="text-green-400 text-[9px]">GREEN</div>
                      <div className={`font-bold ${scriptState.green > 3 ? 'text-green-500' : 'text-foreground'}`}>{scriptState.green}</div>
                    </div>
                    <div className="text-center p-1 bg-accent/10 rounded">
                      <div className="text-accent text-[9px]">TRAINS</div>
                      <div className="font-bold">{scriptState.trains.length}</div>
                    </div>
                    <div className="text-center p-1 bg-primary/10 rounded">
                      <div className="text-primary text-[9px]">GAP</div>
                      <div className="font-bold">{scriptState.averageGap.toFixed(0)}</div>
                    </div>
                  </div>
                  {/* Gold Prediction */}
                  <div className={`text-center p-2 rounded border ${(scriptState.gamesUntilGold ?? 5) <= 2 ? 'bg-yellow-500/20 border-yellow-500/50' : 'bg-yellow-500/10 border-yellow-500/20'}`}>
                    <div className="text-yellow-400 text-[9px] font-display tracking-widest">NEXT GOLD (5x+) ESTIMATE</div>
                    <div className={`font-bold text-lg font-mono ${(scriptState.gamesUntilGold ?? 5) <= 2 ? 'text-yellow-400 animate-pulse' : 'text-yellow-500/80'}`}>
                      {(scriptState.gamesUntilGold ?? 5) === 0 ? 'NOW!' : `~${scriptState.gamesUntilGold ?? 5} games`}
                    </div>
                    <div className="text-[8px] text-muted-foreground mt-1">
                      Avg gap: {(scriptState.avgGoldGap ?? 8).toFixed(1)} | Last: #{scriptState.lastGold || '-'}
                    </div>
                  </div>
                </div>
              )}

              {/* Multi-Target Formula */}
              <div className="bg-muted/20 p-3 rounded-lg border border-border/30">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] font-display tracking-widest text-muted-foreground flex items-center gap-2">
                    <Zap className="w-3 h-3 text-accent" /> TARGET FORMULA
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-muted-foreground">MULTI</span>
                    <Switch 
                      checked={multiTargetEnabled}
                      onCheckedChange={setMultiTargetEnabled}
                      disabled={isAutoRunning.current}
                      className="scale-75"
                      data-testid="switch-multi-target"
                    />
                  </div>
                </div>
                
                {multiTargetEnabled ? (
                  <div className="space-y-3">
                    {/* Strategy Selection */}
                    <div className="flex gap-1">
                      {(['cycle', 'random', 'weighted'] as const).map((strat) => (
                        <button
                          key={strat}
                          onClick={() => setTargetStrategy(strat)}
                          disabled={isAutoRunning.current}
                          className={`flex-1 px-2 py-1 text-[9px] font-mono uppercase rounded transition-all ${
                            targetStrategy === strat 
                              ? 'bg-accent text-accent-foreground' 
                              : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                          }`}
                          data-testid={`button-strategy-${strat}`}
                        >
                          {strat}
                        </button>
                      ))}
                    </div>
                    
                    {/* Target List */}
                    <div className="space-y-1 max-h-[120px] overflow-auto">
                      {multiTargets.map((target, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-background/50 rounded px-2 py-1">
                          <div className="flex-1 font-mono text-sm text-primary font-bold">{target.toFixed(2)}x</div>
                          <button
                            onClick={() => setMultiTargets(prev => prev.filter((_, i) => i !== idx))}
                            disabled={isAutoRunning.current || multiTargets.length <= 1}
                            className="text-destructive hover:text-destructive/80 disabled:opacity-30"
                            data-testid={`button-remove-target-${idx}`}
                          >
                            <Square className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    
                    {/* Add Target */}
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        step="0.1"
                        min="1.01"
                        max="1000"
                        value={newTargetInput}
                        onChange={(e) => setNewTargetInput(e.target.value)}
                        placeholder="New target..."
                        disabled={isAutoRunning.current}
                        className="h-7 text-xs font-mono bg-muted/50"
                        data-testid="input-new-target"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const val = parseFloat(newTargetInput);
                          if (val >= 1.01 && !multiTargets.includes(val)) {
                            setMultiTargets(prev => [...prev, val].sort((a, b) => a - b));
                            setNewTargetInput('');
                          }
                        }}
                        disabled={isAutoRunning.current || !newTargetInput}
                        className="h-7 px-2"
                        data-testid="button-add-target"
                      >
                        <Activity className="w-3 h-3" />
                      </Button>
                    </div>
                    
                    {/* Quick Presets */}
                    <div className="flex gap-1 flex-wrap">
                      {[1.5, 2.0, 2.5, 3.0, 5.0, 10.0].map((preset) => (
                        <button
                          key={preset}
                          onClick={() => {
                            if (!multiTargets.includes(preset)) {
                              setMultiTargets(prev => [...prev, preset].sort((a, b) => a - b));
                            }
                          }}
                          disabled={isAutoRunning.current || multiTargets.includes(preset)}
                          className="px-2 py-0.5 text-[9px] font-mono bg-primary/10 text-primary rounded hover:bg-primary/20 disabled:opacity-30"
                          data-testid={`button-preset-${preset}`}
                        >
                          +{preset}x
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Single Target</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        step="0.1"
                        min="1.01"
                        value={targetMultiplier}
                        onChange={(e) => setTargetMultiplier(parseFloat(e.target.value) || 2.0)}
                        disabled={isAutoRunning.current}
                        className="h-8 text-sm font-mono bg-muted/50"
                        data-testid="input-target-multiplier"
                      />
                      <span className="flex items-center text-sm font-mono text-muted-foreground">x</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Bet Strategy */}
              <div className="bg-muted/20 p-3 rounded-lg border border-border/30">
                <h3 className="text-[10px] font-display tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
                  <Settings className="w-3 h-3" /> BET STRATEGY
                </h3>
                <div className="grid grid-cols-2 gap-1">
                  {(['flat', 'martingale', 'fibonacci', 'custom'] as const).map((strat) => (
                    <button
                      key={strat}
                      onClick={() => setBetStrategy(strat)}
                      disabled={isAutoRunning.current}
                      className={`px-2 py-1.5 text-[10px] font-mono uppercase rounded transition-all ${
                        betStrategy === strat 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                      }`}
                      data-testid={`button-bet-${strat}`}
                    >
                      {strat}
                    </button>
                  ))}
                </div>
              </div>

              {isAutoRunning.current && (
                <div className="mt-auto">
                  <Button 
                    size="lg" 
                    variant="destructive"
                    className="w-full h-14 text-xl font-display font-bold tracking-[0.2em]"
                    onClick={toggleAutoBot}
                    data-testid="button-toggle-auto"
                  >
                    [ TERMINATE ]
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Main Game Area */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {/* Grid background */}
          <div className="absolute inset-0 cyber-grid"></div>
          
          {/* Mobile Deposit Bar - Only visible on mobile when wallet connected */}
          {walletConnected && (
            <div className="lg:hidden relative z-20 bg-card/95 backdrop-blur border-b border-primary/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-muted-foreground font-mono mb-0.5">VAULT ADDRESS</div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-primary truncate">
                      {VAULT_ADDRESS.slice(0, 12)}...{VAULT_ADDRESS.slice(-8)}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(VAULT_ADDRESS);
                          alert('Vault address copied!');
                        } catch (err) {
                          const textArea = document.createElement('textarea');
                          textArea.value = VAULT_ADDRESS;
                          document.body.appendChild(textArea);
                          textArea.select();
                          document.execCommand('copy');
                          document.body.removeChild(textArea);
                          alert('Vault address copied!');
                        }
                      }}
                      className="h-6 px-2 text-[10px] bg-primary/20 text-primary"
                    >
                      COPY
                    </Button>
                  </div>
                </div>
                <div className="text-center px-3 border-l border-border/50">
                  <div className="text-[10px] text-muted-foreground font-mono">REAL BAL</div>
                  <div className="text-lg font-bold text-primary font-mono">{realBalance.toFixed(4)}</div>
                </div>
                <Button
                  onClick={checkDeposits}
                  disabled={depositChecking}
                  size="sm"
                  className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/50 h-10"
                >
                  {depositChecking ? '...' : <Wallet className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )}

          {/* Graph Container */}
          <div className="flex-1 relative flex items-center justify-center p-2 overflow-hidden">
            {/* Radial glow behind multiplier */}
            <div className={`absolute w-[500px] h-[500px] rounded-full transition-all duration-300 ${
              gameState === 'CRASHED' 
                ? 'bg-destructive/20 blur-[100px]' 
                : gameState === 'RUNNING'
                ? 'bg-primary/20 blur-[100px] animate-pulse'
                : 'bg-accent/10 blur-[100px]'
            }`}></div>

            <div className="relative z-10 text-center">
              <div className={`font-display font-black tracking-tight tabular-nums transition-all duration-100 
                ${gameState === 'CRASHED' 
                  ? 'text-destructive text-glow scale-110 text-[7rem] lg:text-[9rem]' 
                  : gameState === 'RUNNING'
                  ? 'text-primary text-glow text-[7rem] lg:text-[9rem]'
                  : 'text-foreground text-[7rem] lg:text-[9rem]'}
              `} data-testid="text-multiplier">
                {multiplier.toFixed(2)}x
              </div>
              
              {gameState === 'CRASHED' && (
                <div className="text-2xl font-display font-bold text-destructive mt-4 tracking-[0.3em] animate-pulse">
                  CRASHED
                </div>
              )}
              
              {gameState === 'RUNNING' && !hasCashedOut && (
                <div className="mt-4 flex flex-col items-center gap-2">
                  <div className="text-[10px] text-muted-foreground font-mono tracking-widest">
                    {cashedOutPercent > 0 
                      ? `CASHOUT REMAINING (${((1 - cashedOutPercent) * 100).toFixed(0)}% LEFT)`
                      : 'CASHOUT NOW'}
                  </div>
                  <div className="flex gap-2">
                    {[
                      { pct: 0.10, label: '10%', color: 'from-cyan-500 to-cyan-600' },
                      { pct: 0.25, label: '25%', color: 'from-blue-500 to-blue-600' },
                      { pct: 0.50, label: '50%', color: 'from-purple-500 to-purple-600' },
                      { pct: 1.00, label: 'ALL', color: 'from-green-500 to-green-600' },
                    ].filter(({ pct }) => pct <= (1 - cashedOutPercent + 0.01))
                    .map(({ pct, label, color }) => (
                      <Button
                        key={label}
                        onClick={() => handleCashout(pct)}
                        className={`relative overflow-hidden h-11 w-16 font-display font-bold text-base tracking-wider bg-gradient-to-b ${color} hover:scale-105 transition-transform border-2 border-white/20 shadow-lg`}
                        data-testid={`button-cashout-${label}`}
                      >
                        <div className="absolute inset-0 bg-white/10 opacity-0 hover:opacity-100 transition-opacity"></div>
                        <span className="relative z-10 text-white drop-shadow-lg">{label}</span>
                      </Button>
                    ))}
                  </div>
                  <div className="text-xs text-primary font-mono">
                    +{(activeBet * (1 - cashedOutPercent) * (multiplier - 1)).toFixed(4)} SOL potential
                  </div>
                </div>
              )}

              {gameState === 'RUNNING' && hasCashedOut && (
                <div className="mt-3 flex flex-col items-center gap-1">
                  <div className="text-xl font-display font-bold text-green-400 tracking-widest animate-pulse">
                    CASHED OUT
                  </div>
                  <div className="text-sm text-muted-foreground font-mono">
                    Waiting for round to end...
                  </div>
                </div>
              )}
              
              {gameState === 'IDLE' && mode === 'Manual' && (
                <div className="mt-3 flex flex-col items-center gap-2">
                  {/* Quick bets and 1/2 button at top for easy access */}
                  <div className="flex items-center gap-1 flex-wrap justify-center">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-[10px] font-mono bg-red-500/10 border border-red-500/40 hover:border-red-500 hover:bg-red-500/20 text-red-400 transition-all px-2 py-1 h-7"
                      onClick={() => {
                        const newBet = Math.max(0.0001, Math.round((manualBet / 2) * 10000) / 10000);
                        setManualBet(newBet);
                        setBaseBet(newBet);
                      }}
                      data-testid="button-half-bet"
                    >
                      1/2
                    </Button>
                    {quickBets.map((v, idx) => (
                      editingQuickBet === idx ? (
                        <Input
                          key={idx}
                          type="number"
                          step="0.0001"
                          min="0.0001"
                          autoFocus
                          value={quickBetInput}
                          onChange={(e) => setQuickBetInput(e.target.value)}
                          onBlur={() => {
                            const newVal = parseFloat(quickBetInput);
                            if (newVal > 0) {
                              setQuickBets(prev => prev.map((b, i) => i === idx ? newVal : b));
                            }
                            setEditingQuickBet(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const newVal = parseFloat(quickBetInput);
                              if (newVal > 0) {
                                setQuickBets(prev => prev.map((b, i) => i === idx ? newVal : b));
                              }
                              setEditingQuickBet(null);
                            }
                            if (e.key === 'Escape') setEditingQuickBet(null);
                          }}
                          className="w-16 h-7 text-xs font-mono bg-muted/50 border-primary text-center"
                          data-testid={`input-quick-bet-${idx}`}
                        />
                      ) : (
                        <Button 
                          key={idx}
                          variant="outline" 
                          size="sm" 
                          className="text-[10px] font-mono bg-primary/10 border border-primary/40 hover:border-primary hover:bg-primary/20 text-primary transition-all px-2 py-1 h-7"
                          onClick={() => {
                            const newBet = Math.round((manualBet + v) * 10000) / 10000;
                            setManualBet(newBet);
                            setBaseBet(newBet);
                          }}
                          onDoubleClick={() => {
                            setEditingQuickBet(idx);
                            setQuickBetInput(v.toString());
                          }}
                          data-testid={`button-quick-bet-${idx}`}
                        >
                          {v} SOL
                        </Button>
                      )
                    ))}
                  </div>
                  
                  {/* Main betting controls */}
                  <div className="flex items-center gap-2 bg-card/80 backdrop-blur p-2 rounded-xl neon-border">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] text-muted-foreground font-mono">BET</span>
                      <div className="flex items-center gap-1">
                        <Input 
                          type="number" 
                          value={manualBet}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setManualBet(val);
                            setBaseBet(val);
                          }}
                          className="w-24 font-mono text-base bg-muted/50 border-border/50 h-9"
                          data-testid="input-bet-center"
                          step="0.0001"
                          min="0.0001"
                        />
                      </div>
                    </div>
                    <div className="h-10 w-px bg-border/50"></div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] text-muted-foreground font-mono">TARGET</span>
                      <div className="flex items-center gap-1">
                        <Input 
                          type="number" 
                          value={manualTarget}
                          onChange={(e) => setManualTarget(Number(e.target.value))}
                          className="w-16 font-mono text-base bg-muted/50 border-border/50 h-9"
                          data-testid="input-target-center"
                          step="0.1"
                        />
                        <span className="text-xs text-accent font-bold">x</span>
                      </div>
                    </div>
                    <div className="h-10 w-px bg-border/50"></div>
                    <div className="flex flex-col gap-0.5 text-center">
                      <span className="text-[9px] text-muted-foreground font-mono">BAL</span>
                      <div className="font-mono font-bold text-base text-primary" data-testid="text-balance-inline">
                        {balance.toFixed(4)}
                      </div>
                    </div>
                    <Button 
                      size="lg" 
                      variant="outline"
                      className="h-10 px-6 text-base font-display font-bold tracking-[0.15em] bg-transparent border border-[hsl(var(--neon-pink))]/30 text-[hsl(var(--neon-pink))] hover:bg-[hsl(var(--neon-pink))]/10 transition-all"
                      onClick={handleManualBet}
                      data-testid="button-place-bet"
                    >
                      BET
                    </Button>
                  </div>
                </div>
              )}

              {/* Script Formula - Shows in Auto mode when idle */}
              {gameState === 'IDLE' && mode === 'Auto' && (
                <div className="mt-4 flex flex-col items-center gap-3 w-full max-w-xl mx-auto">
                  <div className="w-full bg-card/80 backdrop-blur p-4 rounded-xl neon-border-magenta">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[10px] font-display tracking-widest text-accent flex items-center gap-2">
                        <Settings className="w-3 h-3" /> CUSTOM FORMULA
                      </h3>
                      <TooltipProvider>
                        <Tooltip delayDuration={0}>
                          <TooltipTrigger asChild>
                            <button className="p-1 rounded-full bg-yellow-500/20 hover:bg-yellow-500/30 transition-colors">
                              <Lightbulb className="w-3 h-3 text-yellow-400" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-[280px] p-4 bg-card border-border">
                            <div className="space-y-2">
                              <h4 className="font-display font-bold text-primary text-sm">HOW TO USE SCRIPT MODE</h4>
                              <ol className="text-xs space-y-1.5 text-muted-foreground list-decimal list-inside">
                                <li><span className="text-foreground">Set your TARGET</span> - The multiplier to auto-cashout at</li>
                                <li><span className="text-foreground">Set BASE BET</span> - Your starting bet amount</li>
                                <li><span className="text-foreground">Choose STRATEGY</span> - Flat, Martingale, or Fibonacci</li>
                                <li><span className="text-foreground">Configure ON WIN/LOSS</span> - How bets adjust after each round</li>
                                <li><span className="text-foreground">Set STOP LOSS</span> - Maximum amount you're willing to lose</li>
                                <li><span className="text-foreground">Click EXECUTE</span> - Script will auto-bet for you!</li>
                              </ol>
                              <div className="pt-2 border-t border-border mt-2">
                                <p className="text-[10px] text-yellow-400">TIP: Enable Pattern Detection for AI-assisted multiplier suggestions.</p>
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      <div className="space-y-1">
                        <Label className="text-[9px] text-muted-foreground">TARGET</Label>
                        <Input 
                          type="number" 
                          value={targetMultiplier}
                          onChange={(e) => setTargetMultiplier(Number(e.target.value))}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !isAutoRunning.current) toggleAutoBot(); }}
                          disabled={isAutoRunning.current}
                          className="h-8 font-mono text-sm bg-muted/50"
                          step="0.1"
                          data-testid="input-target-mult"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9px] text-muted-foreground">BASE BET</Label>
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 px-2 text-[10px] font-mono bg-red-500/10 border border-red-500/40 hover:border-red-500 hover:bg-red-500/20 text-red-400"
                            onClick={() => setBaseBet(Math.max(0.0001, Math.round((baseBet / 2) * 10000) / 10000))}
                            disabled={isAutoRunning.current}
                            data-testid="button-half-base-bet"
                          >
                            1/2
                          </Button>
                          <Input 
                            type="number" 
                            value={baseBet}
                            onChange={(e) => setBaseBet(Number(e.target.value))}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !isAutoRunning.current) toggleAutoBot(); }}
                            disabled={isAutoRunning.current}
                            className="h-8 font-mono text-sm bg-muted/50 flex-1"
                            step="0.0001"
                            min="0.0001"
                            data-testid="input-base-bet"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9px] text-muted-foreground">STOP LOSS</Label>
                        <Input 
                          type="number" 
                          value={stopLoss}
                          onChange={(e) => setStopLoss(Number(e.target.value))}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !isAutoRunning.current) toggleAutoBot(); }}
                          disabled={isAutoRunning.current}
                          className="h-8 font-mono text-sm bg-muted/50"
                          step="0.1"
                          data-testid="input-stop-loss"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9px] text-muted-foreground">MAX BET %</Label>
                        <Input 
                          type="number" 
                          value={maxBetPercent}
                          onChange={(e) => setMaxBetPercent(Number(e.target.value))}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !isAutoRunning.current) toggleAutoBot(); }}
                          disabled={isAutoRunning.current}
                          className="h-8 font-mono text-sm bg-muted/50"
                          step="1"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 mb-3">
                      <div className="space-y-1">
                        <Label className="text-[9px] text-muted-foreground">STRATEGY</Label>
                        <Select value={betStrategy} onValueChange={(v) => setBetStrategy(v as any)} disabled={isAutoRunning.current}>
                          <SelectTrigger className="h-8 text-xs font-mono bg-muted/50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="flat">Flat</SelectItem>
                            <SelectItem value="martingale">Martingale</SelectItem>
                            <SelectItem value="fibonacci">Fibonacci</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9px] text-muted-foreground">ON WIN</Label>
                        <Select value={onWinAction} onValueChange={(v) => setOnWinAction(v as any)} disabled={isAutoRunning.current}>
                          <SelectTrigger className="h-8 text-xs font-mono bg-muted/50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="reset">Reset</SelectItem>
                            <SelectItem value="same">Same</SelectItem>
                            <SelectItem value="increase">Increase</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {onWinAction === 'increase' && (
                        <div className="space-y-1">
                          <Label className="text-[9px] text-muted-foreground">WIN +%</Label>
                          <Input 
                            type="number" 
                            value={onWinPercent}
                            onChange={(e) => setOnWinPercent(Number(e.target.value))}
                            disabled={isAutoRunning.current}
                            className="h-8 font-mono text-sm bg-muted/50"
                            step="10"
                          />
                        </div>
                      )}
                      <div className="space-y-1">
                        <Label className="text-[9px] text-muted-foreground">ON LOSS</Label>
                        <Select value={onLossAction} onValueChange={(v) => setOnLossAction(v as any)} disabled={isAutoRunning.current}>
                          <SelectTrigger className="h-8 text-xs font-mono bg-muted/50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="martingale">Multiply</SelectItem>
                            <SelectItem value="fibonacci">Fibonacci</SelectItem>
                            <SelectItem value="increase">Increase %</SelectItem>
                            <SelectItem value="same">Same</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {(onLossAction === 'martingale' || onLossAction === 'increase') && (
                        <div className="space-y-1">
                          <Label className="text-[9px] text-muted-foreground">
                            {onLossAction === 'martingale' ? 'MULT BY' : 'LOSS +%'}
                          </Label>
                          <Input 
                            type="number" 
                            value={onLossMultiplier}
                            onChange={(e) => setOnLossMultiplier(Number(e.target.value))}
                            disabled={isAutoRunning.current}
                            className="h-8 font-mono text-sm bg-muted/50"
                            step="0.1"
                          />
                        </div>
                      )}
                    </div>

                    {/* Strategy Guide */}
                    <div className="p-3 bg-gradient-to-r from-[hsl(var(--neon-pink)/0.1)] to-primary/5 rounded-lg border border-[hsl(var(--neon-pink)/0.3)] mb-3" data-testid="strategy-guide">
                      <div className="flex items-start gap-2">
                        <Lightbulb className="w-4 h-4 text-[hsl(var(--neon-pink))] mt-0.5 flex-shrink-0" />
                        <div className="space-y-2 text-[10px]">
                          <div>
                            <span className="text-[hsl(var(--neon-pink))] font-display font-bold tracking-wider">
                              {betStrategy === 'flat' && 'FLAT BETTING'}
                              {betStrategy === 'martingale' && 'MARTINGALE'}
                              {betStrategy === 'fibonacci' && 'FIBONACCI'}
                              {betStrategy === 'custom' && 'CUSTOM STRATEGY'}
                            </span>
                            <span className={`ml-2 px-1.5 py-0.5 rounded text-[8px] font-mono ${
                              betStrategy === 'flat' ? 'bg-green-500/20 text-green-400' :
                              betStrategy === 'martingale' ? 'bg-red-500/20 text-red-400' :
                              betStrategy === 'fibonacci' ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-blue-500/20 text-blue-400'
                            }`}>
                              {betStrategy === 'flat' ? 'LOW RISK' :
                               betStrategy === 'martingale' ? 'HIGH RISK' :
                               betStrategy === 'fibonacci' ? 'MED RISK' : 'CUSTOM'}
                            </span>
                          </div>
                          <p className="text-muted-foreground leading-relaxed">
                            {betStrategy === 'flat' && 'Bet the same amount every round. Simple and safe - your balance changes slowly. Best for steady, long sessions.'}
                            {betStrategy === 'martingale' && 'Double your bet after each loss. One win recovers all losses + profit. Risky - losing streaks can drain balance fast!'}
                            {betStrategy === 'fibonacci' && 'Follow the sequence (1,1,2,3,5,8...) after losses. Gentler than Martingale but still recovers losses over time.'}
                            {betStrategy === 'custom' && 'Set your own rules using ON WIN and ON LOSS options below. Full control over bet progression.'}
                          </p>
                          <div className="pt-1 border-t border-border/30 grid grid-cols-2 gap-2 text-muted-foreground">
                            <div>
                              <span className="text-primary">ON WIN:</span>{' '}
                              {onWinAction === 'reset' && 'Return to base bet'}
                              {onWinAction === 'same' && 'Keep current bet'}
                              {onWinAction === 'increase' && `Increase by ${onWinPercent}%`}
                            </div>
                            <div>
                              <span className="text-accent">ON LOSS:</span>{' '}
                              {onLossAction === 'martingale' && `Multiply bet by ${onLossMultiplier}x`}
                              {onLossAction === 'fibonacci' && 'Next Fibonacci number'}
                              {onLossAction === 'increase' && `Increase by ${onLossMultiplier}%`}
                              {onLossAction === 'same' && 'Keep current bet'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-2 bg-muted/20 rounded">
                      <div>
                        <span className="text-[10px] font-display">PATTERN DETECTION</span>
                        <span className="text-[9px] text-muted-foreground ml-2">Smart AI</span>
                      </div>
                      <Switch checked={usePatternDetection} onCheckedChange={setUsePatternDetection} disabled={isAutoRunning.current} />
                    </div>
                  </div>
                  
                  <Button 
                    size="lg" 
                    variant="outline"
                    className="h-12 px-16 text-xl font-display font-bold tracking-[0.2em] bg-transparent border border-accent/30 text-accent hover:bg-accent/10 transition-all"
                    onClick={toggleAutoBot}
                    data-testid="button-execute-center"
                  >
                    [ EXECUTE ]
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Panel */}
          <div className="h-[160px] border-t border-border/50 bg-card/90 backdrop-blur flex divide-x divide-border/50">
            
            {/* Stats Panel */}
            <div className="w-[180px] flex flex-col p-2 pt-1 space-y-1 justify-center">
              <div className="text-[10px] text-muted-foreground font-display tracking-widest flex items-center gap-2 pb-1 border-b border-border/30">
                <Activity className="w-3 h-3 text-primary" /> STATS
              </div>
              <div className="flex justify-between text-sm py-0.5">
                <span className="text-muted-foreground font-mono font-semibold">Games:</span>
                <span className="font-mono font-bold text-primary" data-testid="text-total-games">{scriptState.roundsPlayed}</span>
              </div>
              <div className="flex justify-between text-sm py-0.5">
                <span className="text-muted-foreground font-mono font-semibold">Win Rate:</span>
                <span className="font-mono font-bold" data-testid="text-win-rate">{winRate}%</span>
              </div>
              <div className="flex justify-between text-sm py-0.5">
                <span className="text-muted-foreground font-mono font-semibold">P/L:</span>
                <span className={`font-mono font-bold ${parseFloat(netProfit) >= 0 ? 'text-primary' : 'text-destructive'}`} data-testid="text-net-profit">
                  {parseFloat(netProfit) >= 0 ? '+' : ''}{netProfit}
                </span>
              </div>
              <div className="flex justify-between text-sm py-0.5">
                <span className="text-muted-foreground font-mono font-semibold">Max Hit:</span>
                <span className="font-mono font-bold text-accent">{scriptState.largestMultiplier.toFixed(2)}x</span>
              </div>
            </div>

            {/* History List */}
            <div className="w-[200px] flex flex-col">
              <div className="p-1.5 border-b border-border/50 bg-muted/20 text-[10px] font-display tracking-widest flex items-center gap-2 text-muted-foreground">
                <History className="w-3 h-3 text-accent" /> HISTORY
              </div>
              <ScrollArea className="flex-1">
                <div className="flex flex-col">
                  {gameHistory.map((game: Game) => (
                    <div key={game.id} className="flex justify-between items-center py-1.5 px-2 border-b border-border/30 text-sm hover:bg-muted/30 transition-colors" data-testid={`row-game-${game.id}`}>
                      <span className={`font-mono font-bold ${parseFloat(game.crash) >= 2.0 ? 'text-green-400' : 'text-red-400'}`}>
                        {parseFloat(game.crash).toFixed(2)}x
                      </span>
                      <span className={`font-mono font-semibold ${parseFloat(game.profit) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {parseFloat(game.profit) >= 0 ? '+' : ''}{parseFloat(game.profit).toFixed(4)}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Live Logs */}
            <div className="flex-1 flex flex-col bg-black/60">
              <div className="p-1.5 border-b border-border/50 bg-muted/20 text-[10px] font-display tracking-widest flex items-center gap-2 text-muted-foreground">
                <Terminal className="w-3 h-3 text-primary" /> LOGS
              </div>
              <ScrollArea className="flex-1 p-2 font-mono text-xs text-muted-foreground">
                <div className="space-y-1">
                  {logs.map((log, i) => (
                    <div key={i} className="border-b border-white/5 pb-1 last:border-0">
                      <span className={
                        log.includes('WIN') || log.includes('SUCCESS') || log.includes('Connected') ? 'text-green-400' : 
                        log.includes('LOSS') || log.includes('CRASH') || log.includes('STOP') || log.includes('terminated') ? 'text-red-400' : 
                        log.includes('TRAIN') || log.includes('SHREK') || log.includes('100x') ? 'text-yellow-400' :
                        log.includes('Adjustment') || log.includes('Strategy') || log.includes('Pattern') ? 'text-accent' :
                        log.includes('SOLANA') || log.includes('SOL') ? 'text-primary' :
                        log.includes('SYSTEM') ? 'text-blue-400' :
                        'text-zinc-500'
                      }>
                        {log}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </div>
      
      {/* Coin Packs Modal */}
      {showCoinPacks && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-xl font-display font-bold text-yellow-400">Buy Soliix Coins</h2>
                <p className="text-sm text-muted-foreground">Get more play coins to try your luck!</p>
              </div>
              <button
                onClick={() => setShowCoinPacks(false)}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
                data-testid="button-close-coin-packs"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 grid gap-3">
              {coinPacks.map((pack) => (
                <div
                  key={pack.id}
                  className={`relative p-4 rounded-lg border transition-all hover:border-yellow-500/50 ${
                    pack.popular 
                      ? 'border-yellow-500/50 bg-yellow-500/5' 
                      : 'border-border bg-muted/20'
                  }`}
                >
                  {pack.popular && (
                    <span className="absolute -top-2 left-4 px-2 py-0.5 bg-yellow-500 text-black text-[10px] font-bold rounded">
                      BEST VALUE
                    </span>
                  )}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-display font-bold text-lg">{pack.name}</div>
                      <div className="text-yellow-400 font-mono text-xl font-bold">{pack.coins} SC</div>
                    </div>
                    <button
                      onClick={() => buyCoinPack(pack.id)}
                      disabled={coinPackLoading === pack.id}
                      className="px-6 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white font-bold transition-all disabled:opacity-50"
                      data-testid={`button-buy-pack-${pack.id}`}
                    >
                      {coinPackLoading === pack.id ? 'Loading...' : `$${(pack.price / 100).toFixed(2)}`}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-border text-center text-xs text-muted-foreground">
              Soliix Coins are play money for entertainment only. Not redeemable for cash.
            </div>
          </div>
        </div>
      )}
      
      {/* Mobile Floating Deposit Footer - Second location */}
      {walletConnected && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur border-t-2 border-primary/50 p-2 safe-area-inset-bottom">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Wallet className="w-5 h-5 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-[9px] text-muted-foreground font-mono">DEPOSIT TO:</div>
                <code className="text-[11px] font-mono text-primary font-bold truncate block">
                  {VAULT_ADDRESS.slice(0, 8)}...{VAULT_ADDRESS.slice(-6)}
                </code>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(VAULT_ADDRESS);
                  alert('Vault address copied!');
                } catch (err) {
                  const textArea = document.createElement('textarea');
                  textArea.value = VAULT_ADDRESS;
                  document.body.appendChild(textArea);
                  textArea.select();
                  document.execCommand('copy');
                  document.body.removeChild(textArea);
                  alert('Vault address copied!');
                }
              }}
              className="h-8 px-3 text-xs bg-primary/20 text-primary font-bold"
            >
              COPY
            </Button>
            <div className="text-center px-2 border-l border-border/50">
              <div className="text-[9px] text-muted-foreground">BAL</div>
              <div className="text-sm font-bold text-primary font-mono">{realBalance.toFixed(4)}</div>
            </div>
            <Button
              onClick={checkDeposits}
              disabled={depositChecking}
              size="sm"
              className="bg-primary hover:bg-primary/80 text-primary-foreground h-8 px-3 font-bold"
            >
              {depositChecking ? '...' : 'CHECK'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
