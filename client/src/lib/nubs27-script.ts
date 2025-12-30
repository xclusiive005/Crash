// Crash 7 Smart Script for SOLSTAx
// Advanced pattern analysis and betting algorithm

export interface ScriptState {
  // Multiplier arrays
  multiplierArray: number[];
  lMultiplierArray: number[];
  
  // History tracking
  scriptHistory: number[];  // Recent crash values
  trains: number[];         // Game IDs where trains occurred (6+ reds)
  
  // Counters
  roundsPlayed: number;
  roundsViewed: number;
  currentGameID: number;
  
  // Betting state
  baseBet: number;
  currentBet: number;
  lastBet: number;
  currentMultiplier: number;
  lastMultiplier: number;
  maxBet: number;
  
  // Pattern tracking
  lastShrek: number;       // Game ID of last > 100x crash
  lastTrain: number;       // Game ID of last train
  gap: number;             // Gap between current game and last train
  averageGap: number;
  
  // Streak tracking
  red: number;             // Current red streak (crash < 2.01)
  green: number;           // Current green streak (crash >= 2.01)
  
  // Result tracking
  lastResult: 'Won' | 'Lost';
  coinLost: number;
  losses: number;
  wins: number;
  
  // Stats
  largestMultiplier: number;
  largestBet: [number, number];  // [amount, multiplier]
  
  // Payout analysis
  payOutPercents: number[];
  payOutConfidence: number[];
  
  // Flags
  enable100: boolean;
  enable100ID: number;
  
  // Balance
  balance: number;
  startBalance: number;
  profit: number;
  
  // Prediction tracking
  lastGold: number;           // Game ID of last gold (5x+)
  goldGaps: number[];         // Gap history between golds
  avgGoldGap: number;         // Average gap between golds
  gamesUntilGold: number;     // Estimated games until next gold
}

export function createInitialState(balance: number, baseBet: number): ScriptState {
  return {
    multiplierArray: [2.5, 3.00, 5.00, 6.00, 7.00],
    lMultiplierArray: [10.00, 20.00, 50.00, 100.00],
    
    scriptHistory: [],
    trains: [],
    
    roundsPlayed: 0,
    roundsViewed: 0,
    currentGameID: 1,
    
    baseBet: baseBet,
    currentBet: baseBet,
    lastBet: baseBet,
    currentMultiplier: 3.00,  // MultiplierArray[1]
    lastMultiplier: 3.00,
    maxBet: balance / 10,
    
    lastShrek: 0,
    lastTrain: 0,
    gap: 0,
    averageGap: 0,
    
    red: 0,
    green: 0,
    
    lastResult: 'Won',
    coinLost: 0,
    losses: 0,
    wins: 0,
    
    largestMultiplier: 2,
    largestBet: [0, 0],
    
    payOutPercents: [],
    payOutConfidence: [],
    
    enable100: false,
    enable100ID: 1000000,
    
    balance: balance,
    startBalance: balance,
    profit: 0,
    
    lastGold: 0,
    goldGaps: [],
    avgGoldGap: 8,  // Default estimate: gold every ~8 games
    gamesUntilGold: 5,
  };
}

// Log the crash and update streaks/trains
export function logLastCrash(state: ScriptState, crashValue: number): { state: ScriptState, logs: string[] } {
  const logs: string[] = [];
  const newState = { ...state };
  
  // Track largest multiplier
  if (crashValue > newState.largestMultiplier) {
    newState.largestMultiplier = crashValue;
  }
  
  // Update red/green streaks
  if (crashValue < 2.01) {
    newState.red++;
    newState.green = 0;
    
    // Train detection: 6 consecutive reds
    if (newState.red === 6) {
      newState.trains.unshift(newState.currentGameID);
      newState.gap = newState.currentGameID - newState.lastTrain;
      
      if (newState.trains.length > 1) {
        // Calculate average gap
        let totalGap = 0;
        for (let i = 0; i < Math.min(newState.trains.length - 1, 10); i++) {
          totalGap += newState.trains[i] - newState.trains[i + 1];
        }
        newState.averageGap = totalGap / Math.min(newState.trains.length - 1, 10);
      }
      
      newState.lastTrain = newState.currentGameID;
      logs.push(`[TRAIN DETECTED] Red x6 at game #${newState.currentGameID}. Gap: ${newState.gap}`);
    }
  } else {
    newState.green++;
    newState.red = 0;
  }
  
  // Shrek detection (> 100x)
  if (crashValue > 100) {
    newState.lastShrek = newState.currentGameID;
    newState.enable100 = false;
    logs.push(`[SHREK] 100x+ detected at game #${newState.currentGameID}: ${crashValue.toFixed(2)}x`);
  }
  
  // Gold detection (5x+) and prediction
  if (crashValue >= 5) {
    if (newState.lastGold > 0) {
      const gap = newState.currentGameID - newState.lastGold;
      newState.goldGaps.unshift(gap);
      if (newState.goldGaps.length > 20) {
        newState.goldGaps.pop();
      }
      // Calculate average gold gap
      const sum = newState.goldGaps.reduce((a, b) => a + b, 0);
      newState.avgGoldGap = sum / newState.goldGaps.length;
    }
    newState.lastGold = newState.currentGameID;
    newState.gamesUntilGold = Math.round(newState.avgGoldGap);
    logs.push(`[GOLD] ${crashValue.toFixed(2)}x detected! Avg gap: ${newState.avgGoldGap.toFixed(1)} games`);
  } else {
    // Update prediction countdown
    const gamesSinceGold = newState.currentGameID - newState.lastGold;
    newState.gamesUntilGold = Math.max(0, Math.round(newState.avgGoldGap - gamesSinceGold));
  }
  
  // Enable 100x betting after gap
  if (newState.currentGameID > newState.lastShrek + 80 && !newState.enable100) {
    newState.enable100 = true;
    newState.enable100ID = newState.currentGameID;
    logs.push(`[100x ENABLED] Ready to target 100x multiplier`);
  }
  
  // Add to history (keep last 50)
  newState.scriptHistory.unshift(crashValue);
  if (newState.scriptHistory.length > 50) {
    newState.scriptHistory.pop();
  }
  
  return { state: newState, logs };
}

// Mini trains strategy adjustment
export function miniTrains(state: ScriptState): { state: ScriptState, logs: string[] } {
  const logs: string[] = [];
  const newState = { ...state };
  
  if (newState.green > 3 && newState.lastResult === 'Lost') {
    newState.currentBet = (newState.coinLost + (newState.baseBet * newState.losses)) / (newState.currentMultiplier - 1);
    newState.currentMultiplier = 2.14;
    logs.push('[Bet Adjustment] Green x3 & Loss - Recovery mode');
  }
  
  if (newState.green > 3 && newState.lastResult === 'Won') {
    newState.currentBet = newState.baseBet;
    newState.currentMultiplier = 3.11;
    logs.push('[Bet Adjustment] Green x3 & Won - Reset to base');
  }
  
  if (newState.red > 3 || newState.green > 3) {
    const randomMult = (Math.floor(Math.random() * 311) + 199) / 100;
    newState.currentMultiplier = randomMult;
    newState.currentBet = (newState.coinLost + (newState.baseBet * newState.losses)) / (newState.currentMultiplier - 1);
    logs.push(`[Bet Adjustment] Streak > 3 - Random target: ${randomMult.toFixed(2)}x`);
  }
  
  return { state: newState, logs };
}

// Three after three strategy
export function threeAfterThree(state: ScriptState): { state: ScriptState, logs: string[] } {
  const logs: string[] = [];
  const newState = { ...state };
  
  // Check if last 3 rounds were all > 2.99x
  if (newState.scriptHistory.length >= 3 &&
      newState.scriptHistory[0] > 2.99 &&
      newState.scriptHistory[1] > 2.99 &&
      newState.scriptHistory[2] > 2.99) {
    
    // Check gaps
    const gapFromTrain = newState.currentGameID - newState.lastTrain;
    const gapFromShrek = newState.currentGameID - newState.lastShrek;
    
    if (gapFromTrain > 15 && gapFromShrek > 10) {
      if (newState.lastResult === 'Won') {
        newState.currentBet = newState.baseBet * 2;
        newState.currentMultiplier = 2.14;
        logs.push('[Bet Adjustment] 3x after 3 rounds & Won - Double bet');
      }
      
      if (newState.lastResult === 'Lost') {
        const randomMult = (Math.floor(Math.random() * 288) + 211) / 100;
        newState.currentMultiplier = randomMult;
        newState.currentBet = (newState.coinLost + (newState.baseBet * newState.losses)) / (newState.currentMultiplier - 1);
        logs.push(`[Bet Adjustment] 3x after 3 rounds & Lost - Target: ${randomMult.toFixed(2)}x`);
      }
    }
  }
  
  return { state: newState, logs };
}

// Find confidence - analyze payout percentages
export function findConfidence(state: ScriptState): { state: ScriptState, bestMultiplier: number, logs: string[] } {
  const logs: string[] = [];
  const newState = { ...state };
  
  // Calculate how often each multiplier in the array would have won
  const payOutPercents: number[] = [];
  
  for (const mult of newState.multiplierArray) {
    if (newState.scriptHistory.length > 0) {
      const wins = newState.scriptHistory.filter(crash => crash >= mult).length;
      const percent = (wins / newState.scriptHistory.length) * 100;
      payOutPercents.push(percent);
    } else {
      payOutPercents.push(50); // Default
    }
  }
  
  newState.payOutPercents = payOutPercents;
  
  // Find confidence (distance from 100%)
  const confidence = payOutPercents.map(p => Math.abs(100 - p));
  newState.payOutConfidence = confidence;
  
  // Find best multiplier (highest confidence where percent > 40%)
  let bestIndex = 0;
  let maxConfidence = 0;
  
  for (let i = 0; i < confidence.length; i++) {
    if (payOutPercents[i] > 40 && confidence[i] > maxConfidence) {
      maxConfidence = confidence[i];
      bestIndex = i;
    }
  }
  
  const bestMultiplier = newState.multiplierArray[bestIndex];
  
  if (newState.scriptHistory.length >= 10) {
    logs.push(`[Analysis] Best target: ${bestMultiplier}x (${payOutPercents[bestIndex].toFixed(1)}% hit rate)`);
  }
  
  return { state: newState, bestMultiplier, logs };
}

// Check and adjust bet within limits
export function checkBet(state: ScriptState): { state: ScriptState, logs: string[] } {
  const logs: string[] = [];
  const newState = { ...state };
  
  // Minimum bet
  if (newState.currentBet < newState.baseBet) {
    newState.currentBet = newState.baseBet;
  }
  
  // Maximum bet (10% of balance)
  if (newState.currentBet > newState.maxBet) {
    newState.currentBet = newState.maxBet;
    logs.push('[Bet Adjustment] Capped at max bet to survive losses');
  }
  
  // Track largest bet
  if (newState.currentBet > newState.largestBet[0]) {
    newState.largestBet = [newState.currentBet, newState.currentMultiplier];
  }
  
  return { state: newState, logs };
}

// Main strategy function - called before each bet
export function calculateNextBet(state: ScriptState): { state: ScriptState, logs: string[] } {
  let currentState = { ...state };
  let allLogs: string[] = [];
  
  // Apply strategies in order
  const { state: s1, logs: l1 } = miniTrains(currentState);
  currentState = s1;
  allLogs = [...allLogs, ...l1];
  
  const { state: s2, logs: l2 } = threeAfterThree(currentState);
  currentState = s2;
  allLogs = [...allLogs, ...l2];
  
  const { state: s3, bestMultiplier, logs: l3 } = findConfidence(currentState);
  currentState = s3;
  allLogs = [...allLogs, ...l3];
  
  // If no specific strategy applied, use confidence-based multiplier
  if (l1.length === 0 && l2.length === 0) {
    currentState.currentMultiplier = bestMultiplier;
  }
  
  // Enable 100x targeting when conditions are met
  if (currentState.enable100 && 
      currentState.currentGameID > currentState.enable100ID + 5 &&
      currentState.lastResult === 'Won') {
    currentState.currentMultiplier = 100;
    currentState.currentBet = currentState.baseBet;
    allLogs.push('[Strategy] Targeting 100x multiplier');
  }
  
  // Final bet check
  const { state: s4, logs: l4 } = checkBet(currentState);
  currentState = s4;
  allLogs = [...allLogs, ...l4];
  
  return { state: currentState, logs: allLogs };
}

// Process a round result
export function processRoundResult(
  state: ScriptState,
  crashValue: number,
  betAmount: number,
  targetMultiplier: number
): { state: ScriptState, won: boolean, profit: number, logs: string[] } {
  let currentState = { ...state };
  let allLogs: string[] = [];
  
  // Log the crash
  const { state: s1, logs: l1 } = logLastCrash(currentState, crashValue);
  currentState = s1;
  allLogs = [...allLogs, ...l1];
  
  // Determine result
  const won = crashValue >= targetMultiplier;
  const profit = won ? betAmount * (targetMultiplier - 1) : -betAmount;
  
  // Update state
  currentState.roundsPlayed++;
  currentState.currentGameID++;
  currentState.lastBet = betAmount;
  currentState.lastMultiplier = targetMultiplier;
  currentState.balance += profit;
  currentState.profit = currentState.balance - currentState.startBalance;
  
  if (won) {
    currentState.lastResult = 'Won';
    currentState.wins++;
    currentState.losses = 0;
    currentState.coinLost = 0;
    allLogs.push(`[WIN] Cashed out at ${targetMultiplier.toFixed(2)}x | Profit: +${profit.toFixed(2)}`);
  } else {
    currentState.lastResult = 'Lost';
    currentState.losses++;
    currentState.coinLost += betAmount;
    allLogs.push(`[LOSS] Crashed at ${crashValue.toFixed(2)}x | Loss: ${profit.toFixed(2)}`);
  }
  
  // Calculate next bet
  const { state: s2, logs: l2 } = calculateNextBet(currentState);
  currentState = s2;
  allLogs = [...allLogs, ...l2];
  
  // Update max bet based on current balance
  currentState.maxBet = currentState.balance / 10;
  
  return { state: currentState, won, profit, logs: allLogs };
}

// Generate crash point (same distribution as real crash games)
export function generateCrashPoint(): number {
  const r = Math.random();
  const rawCrash = 0.99 / (1 - r);
  return Math.max(1.00, Math.floor(rawCrash * 100) / 100);
}
