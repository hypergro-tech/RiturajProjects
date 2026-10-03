# Light, upbeat tutorial music bed (synthesised): plucked chords, soft bass, kick/hat. 100 BPM.
import numpy as np, wave, sys
SR=44100; DUR=float(sys.argv[2]) if len(sys.argv)>2 else 50; BPM=100; beat=60/BPM
n=int(SR*DUR); L=np.zeros(n); R=np.zeros(n)
def note(f,t,d,amp,dec=3.0,pan=0.5,harm=(1,.5,.25,.12)):
    i=int(t*SR); m=min(int(d*SR),n-i)
    if m<=0: return
    tt=np.arange(m)/SR; env=np.exp(-dec*tt)*np.minimum(1,tt/0.005)
    s=sum(a*np.sin(2*np.pi*f*k*tt) for k,a in enumerate(harm,1))*env*amp
    L[i:i+m]+=s*(1-pan); R[i:i+m]+=s*pan
mid=lambda m:440*2**((m-69)/12)
chords=[[60,64,67,72],[57,60,64,69],[53,57,60,65],[55,59,62,67]]  # C Am F G
roots=[36,33,29,31]
rng=np.random.default_rng(1)
bar=4*beat; t=0; b=0
while t<DUR:
    ch=chords[b%4]
    for s in range(8):                              # eighth-note pluck arpeggio
        nt=ch[[0,2,1,3,2,1,3,2][s]]+12
        note(mid(nt),t+s*beat/2,0.6,0.05,dec=6,pan=0.35+0.3*(s%2))
    for c in ch: note(mid(c),t,bar,0.018,dec=0.6,pan=0.5,harm=(1,.3))   # soft pad
    for q in (0,1.5,2,3.5):                         # bass
        note(mid(roots[b%4]),t+q*beat,beat*0.9,0.11,dec=3,harm=(1,.3,.1))
    if b>=1:
        for q in range(4):                          # kick
            i=int((t+q*beat)*SR); m=min(int(0.25*SR),n-i)
            if m>0:
                tt=np.arange(m)/SR; f=50+90*np.exp(-30*tt)
                k=np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-12*tt)*0.18; L[i:i+m]+=k; R[i:i+m]+=k
        for q in range(8):                          # hats
            i=int((t+q*beat/2+beat/4)*SR); m=min(int(0.04*SR),n-i)
            if m>0:
                h=rng.standard_normal(m)*np.exp(-np.arange(m)/SR*90)*0.025; h=np.diff(h,prepend=0)
                L[i:i+m]+=h*.7; R[i:i+m]+=h
    t+=bar; b+=1
# simple room reverb
ir=np.exp(-np.arange(int(0.8*SR))/SR*5)*rng.standard_normal(int(0.8*SR))*0.02
from scipy.signal import fftconvolve
L=L+fftconvolve(L,ir)[:n]; R=R+fftconvolve(R,ir[::-1])[:n]
x=np.stack([L,R],1); x/=np.abs(x).max()*1.12
fade=int(1.5*SR); x[-fade:]*=np.linspace(1,0,fade)[:,None]
with wave.open(sys.argv[1],'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x*32767).astype('<i2').tobytes())
