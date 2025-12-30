import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Rocket, Wallet, ArrowDownToLine, ArrowUpFromLine, Shield, 
  LogOut, RefreshCw, AlertCircle, CheckCircle2, Clock, QrCode
} from 'lucide-react';

interface VaultBalance {
  walletAddress: string;
  totalSol: number;
  totalLamports: number;
  pendingWithdrawals: number;
  houseEdgeAccumulated: number;
  updatedAt: string;
}

interface VaultTransaction {
  id: number;
  type: string;
  amountSol: number;
  status: string;
  createdAt: string;
  metadata: any;
}

interface AdminUser {
  id: string;
  email: string;
  role: string;
  twoFactorEnabled: boolean;
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [balance, setBalance] = useState<VaultBalance | null>(null);
  const [transactions, setTransactions] = useState<VaultTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawWallet, setWithdrawWallet] = useState('');
  const [withdrawTotp, setWithdrawTotp] = useState('');
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);

  const [setup2FADialogOpen, setSetup2FADialogOpen] = useState(false);
  const [setup2FAData, setSetup2FAData] = useState<{ qrCode: string; secret: string; backupCodes: string[] } | null>(null);
  const [verify2FACode, setVerify2FACode] = useState('');

  const token = localStorage.getItem('adminToken');

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  };

  const loadData = async () => {
    try {
      const [profileRes, balanceRes, txRes] = await Promise.all([
        fetchWithAuth('/api/admin/profile'),
        fetchWithAuth('/api/admin/vault/balance'),
        fetchWithAuth('/api/admin/vault/transactions')
      ]);

      if (!profileRes.ok) {
        throw new Error('Session expired');
      }

      const profile = await profileRes.json();
      const bal = await balanceRes.json();
      const txs = await txRes.json();

      setAdmin(profile);
      setBalance(bal);
      setTransactions(txs);
    } catch (err: any) {
      if (err.message === 'Session expired') {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        setLocation('/admin/login');
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      setLocation('/admin/login');
      return;
    }
    loadData();
  }, []);

  const handleDeposit = async () => {
    try {
      const res = await fetchWithAuth('/api/admin/vault/deposit', {
        method: 'POST',
        body: JSON.stringify({ amountSol: parseFloat(depositAmount) })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      setDepositAmount('');
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleWithdraw = async () => {
    try {
      const res = await fetchWithAuth('/api/admin/vault/withdraw', {
        method: 'POST',
        body: JSON.stringify({
          amountSol: parseFloat(withdrawAmount),
          totpCode: withdrawTotp,
          destinationWallet: withdrawWallet
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      setWithdrawAmount('');
      setWithdrawWallet('');
      setWithdrawTotp('');
      setWithdrawDialogOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSetup2FA = async () => {
    try {
      const res = await fetchWithAuth('/api/admin/2fa/setup', { method: 'POST' });
      const data = await res.json();
      setSetup2FAData(data);
      setSetup2FADialogOpen(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleVerify2FA = async () => {
    try {
      const res = await fetchWithAuth('/api/admin/2fa/verify', {
        method: 'POST',
        body: JSON.stringify({ code: verify2FACode })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      setSetup2FADialogOpen(false);
      setSetup2FAData(null);
      setVerify2FACode('');
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLogout = async () => {
    await fetchWithAuth('/api/admin/logout', { method: 'POST' });
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    setLocation('/admin/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center cyber-grid">
        <div className="text-center">
          <div className="text-4xl font-display font-bold gradient-text animate-pulse mb-4">SOLSTAx</div>
          <div className="text-primary text-sm font-mono">Loading vault...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <div className="fixed inset-0 scanline pointer-events-none z-50 opacity-30"></div>

      <header className="h-14 border-b border-border/50 bg-card/80 backdrop-blur-xl flex items-center justify-between px-6 sticky top-0 z-40 neon-border">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 solana-gradient rounded-lg flex items-center justify-center box-glow">
            <Rocket className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-display font-black text-xl tracking-widest gradient-text">VAULT ADMIN</h1>
            <div className="text-[10px] font-mono text-muted-foreground">SOLSTAx MANAGEMENT</div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <Badge variant="outline" className={admin?.twoFactorEnabled ? 'text-green-500 border-green-500/50' : 'text-yellow-500 border-yellow-500/50'}>
            <Shield className="w-3 h-3 mr-1" />
            {admin?.twoFactorEnabled ? '2FA Active' : '2FA Required'}
          </Badge>
          <span className="text-sm font-mono text-muted-foreground">{admin?.email}</span>
          <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="button-admin-logout">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <main className="container mx-auto p-6 max-w-6xl">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!admin?.twoFactorEnabled && (
          <Alert className="mb-6 border-yellow-500/50 bg-yellow-500/10">
            <Shield className="h-4 w-4 text-yellow-500" />
            <AlertDescription className="flex items-center justify-between">
              <span>Two-factor authentication is required for vault withdrawals.</span>
              <Button size="sm" onClick={handleSetup2FA} className="ml-4" data-testid="button-setup-2fa">
                Setup 2FA
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-card/90 border-primary/30 neon-border">
            <CardHeader className="pb-2">
              <CardDescription className="font-mono text-xs uppercase tracking-wider">Vault Balance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-display font-bold text-primary text-glow">
                {balance?.totalSol.toFixed(4)} <span className="text-lg text-muted-foreground">SOL</span>
              </div>
              <div className="mt-2 pt-2 border-t border-border/30">
                <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mb-1">Deposit Wallet</div>
                <div className="text-xs font-mono text-primary/80 break-all">{balance?.walletAddress}</div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/90 border-accent/30">
            <CardHeader className="pb-2">
              <CardDescription className="font-mono text-xs uppercase tracking-wider">House Edge Collected</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-display font-bold text-accent">
                {balance?.houseEdgeAccumulated.toFixed(4)} <span className="text-lg text-muted-foreground">SOL</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/90 border-yellow-500/30">
            <CardHeader className="pb-2">
              <CardDescription className="font-mono text-xs uppercase tracking-wider">Pending Withdrawals</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-display font-bold text-yellow-500">
                {balance?.pendingWithdrawals.toFixed(4)} <span className="text-lg text-muted-foreground">SOL</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="transactions" className="space-y-6">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="transactions" className="font-display">Transactions</TabsTrigger>
            <TabsTrigger value="deposit" className="font-display">Deposit</TabsTrigger>
            <TabsTrigger value="withdraw" className="font-display">Withdraw</TabsTrigger>
          </TabsList>

          <TabsContent value="transactions">
            <Card className="bg-card/90 border-border/50">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-display">Transaction History</CardTitle>
                <Button variant="ghost" size="sm" onClick={loadData}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {transactions.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg" data-testid={`tx-row-${tx.id}`}>
                        <div className="flex items-center gap-3">
                          {tx.type === 'deposit' ? (
                            <ArrowDownToLine className="w-5 h-5 text-green-500" />
                          ) : tx.type === 'withdrawal' ? (
                            <ArrowUpFromLine className="w-5 h-5 text-red-500" />
                          ) : (
                            <Wallet className="w-5 h-5 text-accent" />
                          )}
                          <div>
                            <div className="font-mono text-sm capitalize">{tx.type.replace('_', ' ')}</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(tx.createdAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge variant="outline" className={
                            tx.status === 'completed' ? 'text-green-500 border-green-500/50' :
                            tx.status === 'pending' ? 'text-yellow-500 border-yellow-500/50' :
                            'text-red-500 border-red-500/50'
                          }>
                            {tx.status === 'completed' ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <Clock className="w-3 h-3 mr-1" />}
                            {tx.status}
                          </Badge>
                          <div className={`font-mono font-bold ${tx.type === 'deposit' || tx.type === 'house_edge' ? 'text-green-500' : 'text-red-500'}`}>
                            {tx.type === 'deposit' || tx.type === 'house_edge' ? '+' : '-'}{tx.amountSol.toFixed(4)} SOL
                          </div>
                        </div>
                      </div>
                    ))}
                    {transactions.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground font-mono">
                        No transactions yet
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="deposit">
            <Card className="bg-card/90 border-border/50 max-w-md">
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <ArrowDownToLine className="w-5 h-5 text-green-500" />
                  Load Funds to Vault
                </CardTitle>
                <CardDescription>Add SOL to the vault for player payouts</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase tracking-wider">Amount (SOL)</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="bg-muted/50 border-border/50 font-mono"
                    placeholder="0.0000"
                    data-testid="input-deposit-amount"
                  />
                </div>
                <Button 
                  onClick={handleDeposit} 
                  className="w-full solana-gradient"
                  disabled={!depositAmount || parseFloat(depositAmount) <= 0}
                  data-testid="button-deposit"
                >
                  Deposit to Vault
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="withdraw">
            <Card className="bg-card/90 border-border/50 max-w-md">
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <ArrowUpFromLine className="w-5 h-5 text-red-500" />
                  Withdraw from Vault
                </CardTitle>
                <CardDescription>Requires 2FA verification for security</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!admin?.twoFactorEnabled ? (
                  <Alert>
                    <Shield className="h-4 w-4" />
                    <AlertDescription>
                      You must enable 2FA before withdrawing funds.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label className="font-mono text-xs uppercase tracking-wider">Amount (SOL)</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        className="bg-muted/50 border-border/50 font-mono"
                        placeholder="0.0000"
                        data-testid="input-withdraw-amount"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-mono text-xs uppercase tracking-wider">Destination Wallet</Label>
                      <Input
                        value={withdrawWallet}
                        onChange={(e) => setWithdrawWallet(e.target.value)}
                        className="bg-muted/50 border-border/50 font-mono"
                        placeholder="Solana wallet address"
                        data-testid="input-withdraw-wallet"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-mono text-xs uppercase tracking-wider flex items-center gap-2">
                        <Shield className="w-4 h-4 text-primary" />
                        2FA Code
                      </Label>
                      <Input
                        type="text"
                        value={withdrawTotp}
                        onChange={(e) => setWithdrawTotp(e.target.value)}
                        className="bg-muted/50 border-border/50 font-mono text-center text-xl tracking-[0.5em]"
                        placeholder="000000"
                        maxLength={6}
                        data-testid="input-withdraw-totp"
                      />
                    </div>
                    <Button 
                      onClick={handleWithdraw}
                      className="w-full bg-red-600 hover:bg-red-700"
                      disabled={!withdrawAmount || !withdrawWallet || !withdrawTotp}
                      data-testid="button-withdraw"
                    >
                      Withdraw Funds
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={setup2FADialogOpen} onOpenChange={setSetup2FADialogOpen}>
        <DialogContent className="bg-card border-primary/30">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <QrCode className="w-5 h-5 text-primary" />
              Setup Two-Factor Authentication
            </DialogTitle>
            <DialogDescription>
              Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
            </DialogDescription>
          </DialogHeader>
          
          {setup2FAData && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <img src={setup2FAData.qrCode} alt="2FA QR Code" className="rounded-lg" />
              </div>
              
              <div className="p-3 bg-muted/50 rounded-lg">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Manual Entry Key</Label>
                <div className="font-mono text-sm break-all mt-1">{setup2FAData.secret}</div>
              </div>

              <div className="p-3 bg-muted/50 rounded-lg">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Backup Codes (Save These!)</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {setup2FAData.backupCodes.map((code, i) => (
                    <div key={i} className="font-mono text-sm text-center p-1 bg-background rounded">{code}</div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase tracking-wider">Verify Code</Label>
                <Input
                  type="text"
                  value={verify2FACode}
                  onChange={(e) => setVerify2FACode(e.target.value)}
                  className="font-mono text-center text-xl tracking-[0.5em]"
                  placeholder="000000"
                  maxLength={6}
                  data-testid="input-verify-2fa"
                />
              </div>

              <Button onClick={handleVerify2FA} className="w-full solana-gradient" data-testid="button-verify-2fa">
                Verify & Enable 2FA
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
