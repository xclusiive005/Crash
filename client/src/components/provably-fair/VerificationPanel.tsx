import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Shield, Check, X, Hash, Key, RefreshCw, ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface ProvablyFairRound {
  id: string;
  serverSeedHash: string;
  serverSeed: string | null;
  clientSeed: string;
  nonce: number;
  crashMultiplier: string;
  revealedAt: string | null;
}

interface VerificationResult {
  serverSeedHash: string;
  crashPoint: number;
  verified: boolean;
}

export function VerificationPanel() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [serverSeed, setServerSeed] = useState('');
  const [clientSeed, setClientSeed] = useState('');
  const [nonce, setNonce] = useState('1');
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  const { data: history, isLoading, refetch } = useQuery<ProvablyFairRound[]>({
    queryKey: ['provably-fair-history'],
    queryFn: async () => {
      const res = await fetch('/api/provably-fair/history?limit=10');
      if (!res.ok) throw new Error('Failed to fetch history');
      return res.json();
    },
    refetchInterval: 30000
  });

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const res = await fetch('/api/provably-fair/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverSeed,
          clientSeed,
          nonce: parseInt(nonce)
        })
      });
      const result = await res.json();
      setVerificationResult(result);
    } catch (err) {
      console.error('Verification failed:', err);
    } finally {
      setVerifying(false);
    }
  };

  const truncateHash = (hash: string) => {
    if (!hash) return '';
    return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 border-primary/30" data-testid="button-provably-fair">
          <Shield className="w-4 h-4 text-primary" />
          <span className="hidden sm:inline">Provably Fair</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl bg-card/95 backdrop-blur border-primary/30">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Provably Fair Gaming
          </DialogTitle>
          <DialogDescription>
            Every crash multiplier is cryptographically generated and verifiable
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="verify" className="mt-4">
          <TabsList className="bg-muted/50 w-full">
            <TabsTrigger value="verify" className="flex-1 font-mono text-xs">VERIFY</TabsTrigger>
            <TabsTrigger value="history" className="flex-1 font-mono text-xs">HISTORY</TabsTrigger>
            <TabsTrigger value="how" className="flex-1 font-mono text-xs">HOW IT WORKS</TabsTrigger>
          </TabsList>

          <TabsContent value="verify" className="space-y-4 mt-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase tracking-wider flex items-center gap-2">
                  <Key className="w-3 h-3" />
                  Server Seed
                </Label>
                <Input
                  value={serverSeed}
                  onChange={(e) => setServerSeed(e.target.value)}
                  className="bg-muted/50 font-mono text-xs"
                  placeholder="Enter revealed server seed"
                  data-testid="input-server-seed"
                />
              </div>

              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase tracking-wider flex items-center gap-2">
                  <Hash className="w-3 h-3" />
                  Client Seed
                </Label>
                <Input
                  value={clientSeed}
                  onChange={(e) => setClientSeed(e.target.value)}
                  className="bg-muted/50 font-mono text-xs"
                  placeholder="Enter client seed"
                  data-testid="input-client-seed"
                />
              </div>

              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase tracking-wider">Nonce</Label>
                <Input
                  type="number"
                  value={nonce}
                  onChange={(e) => setNonce(e.target.value)}
                  className="bg-muted/50 font-mono"
                  min="1"
                  data-testid="input-nonce"
                />
              </div>

              <Button 
                onClick={handleVerify} 
                className="solana-gradient"
                disabled={!serverSeed || !clientSeed || verifying}
                data-testid="button-verify"
              >
                {verifying ? 'Verifying...' : 'Verify Crash Point'}
              </Button>

              {verificationResult && (
                <div className={`p-4 rounded-lg border ${verificationResult.verified ? 'bg-green-500/10 border-green-500/50' : 'bg-red-500/10 border-red-500/50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {verificationResult.verified ? (
                      <Check className="w-5 h-5 text-green-500" />
                    ) : (
                      <X className="w-5 h-5 text-red-500" />
                    )}
                    <span className="font-display font-bold">
                      {verificationResult.verified ? 'Verified!' : 'Verification Failed'}
                    </span>
                  </div>
                  <div className="space-y-1 text-sm font-mono">
                    <div className="text-muted-foreground">
                      Hash: <span className="text-foreground">{truncateHash(verificationResult.serverSeedHash)}</span>
                    </div>
                    <div className="text-muted-foreground">
                      Crash Point: <span className="text-primary font-bold text-lg">{verificationResult.crashPoint.toFixed(2)}x</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-muted-foreground font-mono">Recent Revealed Rounds</span>
              <Button variant="ghost" size="sm" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : history && history.length > 0 ? (
                  history.map((round) => (
                    <div key={round.id} className="p-3 bg-muted/30 rounded-lg text-xs font-mono" data-testid={`pf-round-${round.id}`}>
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="outline" className="text-[10px]">
                          Round #{round.id.slice(0, 8)}
                        </Badge>
                        <span className="text-primary font-bold text-base">{round.crashMultiplier}x</span>
                      </div>
                      <div className="space-y-1 text-muted-foreground">
                        <div className="truncate">
                          <span className="text-foreground/60">Hash:</span> {truncateHash(round.serverSeedHash)}
                        </div>
                        {round.serverSeed && (
                          <div className="truncate">
                            <span className="text-foreground/60">Seed:</span> {truncateHash(round.serverSeed)}
                          </div>
                        )}
                        <div>
                          <span className="text-foreground/60">Client:</span> {round.clientSeed}
                        </div>
                        <div>
                          <span className="text-foreground/60">Nonce:</span> {round.nonce}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">No revealed rounds yet</div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="how" className="mt-4 space-y-4">
            <Card className="bg-muted/30 border-none">
              <CardContent className="pt-4 space-y-3 text-sm">
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-primary">1</span>
                  </div>
                  <div>
                    <div className="font-medium">Server Seed Generated</div>
                    <div className="text-muted-foreground text-xs">
                      Before each round, a random server seed is generated and its SHA-256 hash is published.
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-primary">2</span>
                  </div>
                  <div>
                    <div className="font-medium">Client Seed Added</div>
                    <div className="text-muted-foreground text-xs">
                      A client seed (from your session) and nonce are combined with the server seed.
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-primary">3</span>
                  </div>
                  <div>
                    <div className="font-medium">Crash Point Calculated</div>
                    <div className="text-muted-foreground text-xs">
                      The combined hash determines the crash multiplier using a provably fair algorithm.
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-accent">4</span>
                  </div>
                  <div>
                    <div className="font-medium">Verification</div>
                    <div className="text-muted-foreground text-xs">
                      After the round, the server seed is revealed. You can verify the hash matches and recalculate the crash point yourself.
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="p-3 bg-primary/10 rounded-lg border border-primary/30">
              <div className="flex items-center gap-2 text-primary font-medium text-sm mb-1">
                <Shield className="w-4 h-4" />
                House Edge: 2.5%
              </div>
              <p className="text-xs text-muted-foreground">
                A 2.5% house edge is applied to all games. This is industry-standard and helps maintain the platform.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
