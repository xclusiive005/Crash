
export type GameResult = {
  id: number;
  crash: number;
  result: 'Won' | 'Lost' | 'Pending';
  profit: number;
  bet: number;
  balance: number;
  timestamp: Date;
  mode: 'Manual' | 'Auto';
};

export type ScriptConfig = {
  baseBet: number;
  stopLoss: number;
  takeProfit: number;
};

export class CrashEngine {
  private balance: number;
  private history: GameResult[] = [];
  private config: ScriptConfig;
  
  // Script state variables
  private losses = 0;
  private wins = 0;
  private greenStreak = 0;
  private redStreak = 0;
  private coinLost = 0;
  
  // Current Game State
  public currentMultiplier = 1.00;
  public isRunning = false;
  public crashPoint = 1.00;
  
  // Bet State
  public nextBetAmount = 0;
  public nextTargetMultiplier = 2.0;
  public autoBetEnabled = false;

  constructor(initialBalance: number, config: ScriptConfig) {
    this.balance = initialBalance;
    this.config = config;
    this.nextBetAmount = config.baseBet;
  }

  public setConfig(config: ScriptConfig) {
    this.config = config;
    // If manual mode, don't override immediately
    if (this.autoBetEnabled) {
        this.nextBetAmount = config.baseBet;
    }
  }

  public toggleAuto(enabled: boolean) {
      this.autoBetEnabled = enabled;
      if (enabled) {
          this.nextBetAmount = this.config.baseBet;
          this.nextTargetMultiplier = 2.0; // Default reset
      }
  }

  // Prepare the round (generate crash point)
  public prepareRound(): number {
    const r = Math.random();
    // Pareto distribution approx
    this.crashPoint = Math.max(1.00, Math.floor(100 / (1 - r) * 0.01) / 100);
    return this.crashPoint;
  }

  // Commit the result after animation finishes
  public commitRound(betAmount: number, targetMultiplier: number, mode: 'Manual' | 'Auto'): GameResult {
    const won = this.crashPoint >= targetMultiplier;
    let profit = 0;

    if (won) {
      profit = betAmount * (targetMultiplier - 1);
      this.balance += profit;
      this.wins++;
      this.losses = 0;
      this.coinLost = 0;
      
      if (this.crashPoint >= 2.0) {
        this.greenStreak++;
        this.redStreak = 0;
      } else {
        this.redStreak++;
        this.greenStreak = 0;
      }

    } else {
      profit = -betAmount;
      this.balance -= betAmount;
      this.losses++;
      this.coinLost += betAmount;
      this.wins = 0;

      if (this.crashPoint < 2.0) {
        this.redStreak++;
        this.greenStreak = 0;
      } else {
        this.greenStreak++;
        this.redStreak = 0;
      }
    }

    const result: GameResult = {
      id: this.history.length + 1,
      crash: this.crashPoint,
      result: won ? 'Won' : 'Lost',
      profit,
      bet: betAmount,
      balance: this.balance,
      timestamp: new Date(),
      mode
    };

    this.history.unshift(result);

    // If Auto, calculate NEXT bet
    if (this.autoBetEnabled) {
        this.runScriptLogic(result);
    }

    return result;
  }

  private runScriptLogic(lastResult: GameResult) {
    // Default Reset
    if (lastResult.result === 'Won') {
      this.nextBetAmount = this.config.baseBet;
      this.nextTargetMultiplier = 3.11; 
    }

    // "minitrains" Logic
    if (this.greenStreak > 3 && lastResult.result === 'Lost') {
       this.nextTargetMultiplier = 2.14;
       this.nextBetAmount = (this.coinLost + (this.config.baseBet * this.losses)) / (this.nextTargetMultiplier - 1);
    }

    if (this.greenStreak > 3 && lastResult.result === 'Won') {
       this.nextBetAmount = this.config.baseBet;
       this.nextTargetMultiplier = 3.11;
    }

    // Random multiplier logic
    if (this.redStreak > 3 || this.greenStreak > 3) {
       const randomMult = (Math.floor(Math.random() * 311) + 199) / 100;
       this.nextTargetMultiplier = randomMult;
       this.nextBetAmount = (this.coinLost + (this.config.baseBet * this.losses)) / (this.nextTargetMultiplier - 1);
    }

    // Safety
    if (this.nextBetAmount < this.config.baseBet) this.nextBetAmount = this.config.baseBet;
    if (this.balance < this.nextBetAmount) this.nextBetAmount = this.balance;
  }

  public getStats() {
    return {
      balance: this.balance,
      nextBetAmount: this.nextBetAmount,
      nextTargetMultiplier: this.nextTargetMultiplier,
      wins: this.wins,
      losses: this.losses,
      history: this.history
    };
  }
}
