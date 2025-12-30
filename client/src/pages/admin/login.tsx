import { useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Rocket, Shield, AlertCircle } from 'lucide-react';

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, totpCode: totpCode || undefined })
      });

      const data = await res.json();

      if (data.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      localStorage.setItem('adminToken', data.token);
      localStorage.setItem('adminUser', JSON.stringify(data.admin));
      setLocation('/admin/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 cyber-grid">
      <div className="fixed inset-0 scanline pointer-events-none z-50 opacity-30"></div>
      
      <Card className="w-full max-w-md bg-card/90 backdrop-blur border-primary/30 neon-border">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 solana-gradient rounded-xl flex items-center justify-center box-glow">
              <Rocket className="w-8 h-8 text-white" />
            </div>
          </div>
          <CardTitle className="font-display text-3xl gradient-text">SOLSTAx Admin</CardTitle>
          <CardDescription className="font-mono text-sm">
            Vault Management Portal
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-muted/50 border-border/50 font-mono"
                placeholder="admin@solstax.io"
                required
                data-testid="input-admin-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-muted/50 border-border/50 font-mono"
                placeholder="••••••••"
                required
                data-testid="input-admin-password"
              />
            </div>

            {requiresTwoFactor && (
              <div className="space-y-2">
                <Label htmlFor="totp" className="font-mono text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  2FA Code
                </Label>
                <Input
                  id="totp"
                  type="text"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  className="bg-muted/50 border-border/50 font-mono text-center text-2xl tracking-[0.5em]"
                  placeholder="000000"
                  maxLength={6}
                  required
                  data-testid="input-admin-totp"
                />
              </div>
            )}

            <Button
              type="submit"
              className="w-full solana-gradient hover:opacity-90 font-display tracking-wider"
              disabled={loading}
              data-testid="button-admin-login"
            >
              {loading ? 'Authenticating...' : 'Access Vault'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
