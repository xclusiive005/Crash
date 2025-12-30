import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getUserProfile, updateUserProfile, getDefaultAvatars, type UpdateProfileRequest } from '@/lib/api';
import { ArrowLeft, User, Wallet, Twitter, MessageCircle, Mail, Save, Camera, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const { publicKey, connected } = useWallet();
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: getUserProfile
  });

  const { data: defaultAvatars } = useQuery({
    queryKey: ['defaultAvatars'],
    queryFn: getDefaultAvatars
  });

  const [formData, setFormData] = useState<UpdateProfileRequest>({
    displayName: '',
    avatarUrl: '',
    walletAddress: '',
    xHandle: '',
    tiktokHandle: '',
    telegramHandle: '',
    email: '',
    discordHandle: ''
  });

  const [avatarPreview, setAvatarPreview] = useState<string>('');

  useEffect(() => {
    if (profile) {
      setFormData({
        displayName: profile.displayName || '',
        avatarUrl: profile.avatarUrl || '',
        walletAddress: profile.walletAddress || '',
        xHandle: profile.xHandle || '',
        tiktokHandle: profile.tiktokHandle || '',
        telegramHandle: profile.telegramHandle || '',
        email: profile.email || '',
        discordHandle: profile.discordHandle || ''
      });
      setAvatarPreview(profile.avatarUrl || '');
    }
  }, [profile]);

  useEffect(() => {
    if (connected && publicKey) {
      setFormData(prev => ({
        ...prev,
        walletAddress: publicKey.toBase58()
      }));
    }
  }, [connected, publicKey]);

  const updateMutation = useMutation({
    mutationFn: updateUserProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setAvatarPreview(base64);
        setFormData(prev => ({ ...prev, avatarUrl: base64 }));
      };
      reader.readAsDataURL(file);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-primary font-mono">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute inset-0 cyber-grid opacity-30"></div>
      
      <div className="relative z-10 container max-w-2xl mx-auto py-8 px-4">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="ghost" size="icon" className="hover:neon-border" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-3xl font-display font-bold tracking-wider text-primary text-glow">
            PROFILE SETTINGS
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="p-6 bg-card/80 backdrop-blur neon-border">
            <div className="flex items-center gap-6 mb-6">
              <Dialog open={avatarDialogOpen} onOpenChange={setAvatarDialogOpen}>
                <DialogTrigger asChild>
                  <div className="relative group cursor-pointer">
                    <Avatar className="w-24 h-24 border-2 border-primary">
                      <AvatarImage src={avatarPreview} />
                      <AvatarFallback className="bg-muted text-2xl font-display">
                        {formData.displayName?.[0]?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                      <Camera className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg bg-gradient-to-br from-card via-card to-[hsl(var(--neon-pink)/0.1)] border-2 border-[hsl(var(--neon-pink))] shadow-[0_0_30px_hsl(var(--neon-pink)/0.4),inset_0_0_20px_hsl(var(--neon-pink)/0.1)]">
                  <DialogHeader>
                    <DialogTitle className="text-transparent bg-clip-text bg-gradient-to-r from-[hsl(var(--neon-pink))] to-primary font-display tracking-wider text-xl">SELECT AVATAR</DialogTitle>
                  </DialogHeader>
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="grid grid-cols-4 gap-3 p-2">
                      {defaultAvatars?.map((avatar, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => {
                            setAvatarPreview(avatar);
                            setFormData(prev => ({ ...prev, avatarUrl: avatar }));
                            setAvatarDialogOpen(false);
                          }}
                          className={`relative rounded-lg overflow-hidden border-2 transition-all duration-300 hover:scale-105 ${
                            avatarPreview === avatar 
                              ? 'border-[hsl(var(--neon-pink))] ring-2 ring-[hsl(var(--neon-pink)/0.5)] shadow-[0_0_15px_hsl(var(--neon-pink)/0.6)]' 
                              : 'border-border/50 hover:border-[hsl(var(--neon-pink)/0.7)] hover:shadow-[0_0_12px_hsl(var(--neon-pink)/0.3)]'
                          }`}
                          data-testid={`avatar-option-${index}`}
                        >
                          <img 
                            src={avatar} 
                            alt={`Avatar ${index + 1}`}
                            className="w-full aspect-square object-cover"
                          />
                          {avatarPreview === avatar && (
                            <div className="absolute inset-0 bg-[hsl(var(--neon-pink)/0.25)] flex items-center justify-center backdrop-blur-[1px]">
                              <Check className="w-6 h-6 text-[hsl(var(--neon-pink))] drop-shadow-[0_0_8px_hsl(var(--neon-pink))]" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 p-3 border-t border-[hsl(var(--neon-pink)/0.3)]">
                      <p className="text-xs text-[hsl(var(--neon-pink)/0.8)] mb-2 font-display tracking-wide">Or upload your own:</p>
                      <label className="flex items-center justify-center gap-2 py-3 px-4 border-2 border-dashed border-[hsl(var(--neon-pink)/0.4)] rounded-lg cursor-pointer hover:border-[hsl(var(--neon-pink))] hover:shadow-[0_0_15px_hsl(var(--neon-pink)/0.3)] transition-all duration-300 bg-[hsl(var(--neon-pink)/0.05)]">
                        <Camera className="w-4 h-4 text-[hsl(var(--neon-pink))]" />
                        <span className="text-sm text-[hsl(var(--neon-pink)/0.9)] font-display tracking-wider">CHOOSE FILE</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={(e) => {
                            handleAvatarChange(e);
                            setAvatarDialogOpen(false);
                          }}
                          className="hidden"
                          data-testid="input-avatar-upload"
                        />
                      </label>
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
              <div className="flex-1">
                <h3 className="text-lg font-display font-bold text-foreground mb-1">
                  {formData.displayName || profile?.username || 'Anonymous'}
                </h3>
                <p className="text-sm text-muted-foreground font-mono">
                  {formData.walletAddress ? 
                    `${formData.walletAddress.slice(0, 6)}...${formData.walletAddress.slice(-4)}` : 
                    'No wallet connected'
                  }
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-display tracking-widest text-muted-foreground flex items-center gap-2">
                  <User className="w-3 h-3" /> SCREEN NAME
                </Label>
                <Input
                  value={formData.displayName}
                  onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                  placeholder="Enter your display name"
                  className="bg-muted/50 font-mono"
                  data-testid="input-display-name"
                />
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-card/80 backdrop-blur neon-border-magenta">
            <h3 className="text-sm font-display tracking-widest text-accent mb-4 flex items-center gap-2">
              <Wallet className="w-4 h-4" /> SOLANA WALLET
            </h3>
            
            <div className="flex items-center gap-4">
              <WalletMultiButton className="!bg-accent hover:!bg-accent/80 !rounded-lg !font-display !tracking-wider" />
              {connected && publicKey && (
                <div className="flex-1 font-mono text-sm text-muted-foreground truncate">
                  {publicKey.toBase58()}
                </div>
              )}
            </div>
            
            {!connected && (
              <p className="text-xs text-muted-foreground mt-3">
                Connect your Phantom or Solflare wallet to enable real SOL betting
              </p>
            )}
          </Card>

          <Card className="p-6 bg-card/80 backdrop-blur border border-border/50">
            <h3 className="text-sm font-display tracking-widest text-foreground mb-4">
              SOCIAL LINKS
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-2">
                  <Twitter className="w-3 h-3" /> X (TWITTER)
                </Label>
                <Input
                  value={formData.xHandle}
                  onChange={(e) => setFormData(prev => ({ ...prev, xHandle: e.target.value }))}
                  placeholder="@username"
                  className="bg-muted/50 font-mono text-sm"
                  data-testid="input-x-handle"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-2">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                  </svg> TIKTOK
                </Label>
                <Input
                  value={formData.tiktokHandle}
                  onChange={(e) => setFormData(prev => ({ ...prev, tiktokHandle: e.target.value }))}
                  placeholder="@username"
                  className="bg-muted/50 font-mono text-sm"
                  data-testid="input-tiktok"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-2">
                  <MessageCircle className="w-3 h-3" /> TELEGRAM
                </Label>
                <Input
                  value={formData.telegramHandle}
                  onChange={(e) => setFormData(prev => ({ ...prev, telegramHandle: e.target.value }))}
                  placeholder="@username"
                  className="bg-muted/50 font-mono text-sm"
                  data-testid="input-telegram"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-2">
                  <Mail className="w-3 h-3" /> GMAIL
                </Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="you@gmail.com"
                  className="bg-muted/50 font-mono text-sm"
                  data-testid="input-email"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-2">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg> DISCORD
                </Label>
                <Input
                  value={formData.discordHandle}
                  onChange={(e) => setFormData(prev => ({ ...prev, discordHandle: e.target.value }))}
                  placeholder="username#0000"
                  className="bg-muted/50 font-mono text-sm"
                  data-testid="input-discord"
                />
              </div>
            </div>
          </Card>

          <div className="flex gap-4">
            <Link href="/" className="flex-1">
              <Button variant="outline" className="w-full" type="button" data-testid="button-cancel">
                Cancel
              </Button>
            </Link>
            <Button 
              type="submit" 
              className="flex-1 bg-primary hover:bg-primary/90 font-display tracking-wider"
              disabled={updateMutation.isPending}
              data-testid="button-save"
            >
              <Save className="w-4 h-4 mr-2" />
              {updateMutation.isPending ? 'SAVING...' : 'SAVE CHANGES'}
            </Button>
          </div>

          {updateMutation.isSuccess && (
            <div className="text-center text-sm text-green-400 font-mono">
              Profile updated successfully!
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
