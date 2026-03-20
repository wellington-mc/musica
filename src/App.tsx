/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  Search, 
  Youtube, 
  Volume2, 
  VolumeX,
  Settings,
  List,
  Zap,
  Smartphone,
  Info,
  Plus,
  ChevronDown,
  MoreVertical,
  Home,
  Library,
  Music2,
  Heart,
  Shuffle,
  Repeat,
  Repeat1
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// YouTube IFrame API Types (Simplified)
declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }
}

export default function App() {
  const [url, setUrl] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [player, setPlayer] = useState<any>(null);
  const [isApiReady, setIsApiReady] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [handsFreeMode, setHandsFreeMode] = useState(true);
  const [autoSkip, setAutoSkip] = useState(true);
  const [isAdDetected, setIsAdDetected] = useState(false);
  const [playlist, setPlaylist] = useState<{id: string, title: string, thumbnail: string}[]>(() => {
    try {
      const saved = localStorage.getItem('skiptube_playlist');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  });
  const [isNowPlayingOpen, setIsNowPlayingOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'search' | 'library'>('home');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [isShuffle, setIsShuffle] = useState(() => localStorage.getItem('skiptube_shuffle') === 'true');
  const [repeatMode, setRepeatMode] = useState<'off' | 'one' | 'all'>(() => (localStorage.getItem('skiptube_repeat') as any) || 'off');
  const [likedSongs, setLikedSongs] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('skiptube_liked');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item: any) => typeof item === 'string' ? { id: item, title: 'Música', thumbnail: '' } : item);
    } catch (e) {
      return [];
    }
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [viewingLiked, setViewingLiked] = useState(false);
  const [userPlaylists, setUserPlaylists] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('skiptube_user_playlists');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  });
  const [isCreatePlaylistModalOpen, setIsCreatePlaylistModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [viewingPlaylistId, setViewingPlaylistId] = useState<string | null>(null);
  const [isAddToPlaylistMenuOpen, setIsAddToPlaylistMenuOpen] = useState<any | null>(null);
  const [trackPendingPlaylist, setTrackPendingPlaylist] = useState<any | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  
  const autoSkipInterval = useRef<NodeJS.Timeout | null>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);
  
  const wakeLock = useRef<any>(null);

  // Refs to avoid stale closures in player events
  const stateRef = useRef({
    isPlaying,
    videoId,
    playlist,
    repeatMode,
    player
  });

  useEffect(() => {
    stateRef.current = {
      isPlaying,
      videoId,
      playlist,
      repeatMode,
      player
    };
  }, [isPlaying, videoId, playlist, repeatMode, player]);

  // Splash Screen Timeout
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // Clear active menu on tab change
  useEffect(() => {
    setActiveMenuId(null);
  }, [activeTab]);

  // Persistence
  useEffect(() => {
    localStorage.setItem('skiptube_playlist', JSON.stringify(playlist));
  }, [playlist]);

  useEffect(() => {
    localStorage.setItem('skiptube_liked', JSON.stringify(likedSongs));
  }, [likedSongs]);

  useEffect(() => {
    localStorage.setItem('skiptube_user_playlists', JSON.stringify(userPlaylists));
  }, [userPlaylists]);

  useEffect(() => {
    localStorage.setItem('skiptube_shuffle', String(isShuffle));
  }, [isShuffle]);

  useEffect(() => {
    localStorage.setItem('skiptube_repeat', repeatMode);
  }, [repeatMode]);

  // Progress Tracking
  useEffect(() => {
    if (player && isPlaying) {
      progressInterval.current = setInterval(() => {
        try {
          const current = player.getCurrentTime();
          const dur = player.getDuration();
          setCurrentTime(current);
          setDuration(dur);
          
          // Update title if it's still "Track X"
          const data = player.getVideoData();
          if (data && data.title) {
            setPlaylist(prev => prev.map(p => 
              p.id === data.video_id && p.title.startsWith('Track ') 
              ? { ...p, title: data.title } 
              : p
            ));
          }
        } catch (e) {}
      }, 1000);
    } else {
      if (progressInterval.current) clearInterval(progressInterval.current);
    }
    return () => { if (progressInterval.current) clearInterval(progressInterval.current); };
  }, [player, isPlaying]);

  // Auto-Skip Logic
  useEffect(() => {
    if (autoSkip && player && isPlaying) {
      autoSkipInterval.current = setInterval(() => {
        try {
          const duration = player.getDuration();
          const currentTime = player.getCurrentTime();
          const videoData = player.getVideoData();
          const currentVideoId = videoData?.video_id;
          
          const isProbablyAd = (currentVideoId && currentVideoId !== videoId && !playlist.some(p => p.id === currentVideoId)) || 
                               (duration > 0 && duration < 61 && currentTime < 5);

          if (isProbablyAd) {
            setIsAdDetected(true);
            player.setPlaybackRate(2); 
            player.mute();
            if (currentTime > 5) player.seekTo(duration - 1, true);
          } else {
            if (isAdDetected) {
              setIsAdDetected(false);
              player.setPlaybackRate(1);
              if (!isMuted) player.unMute();
            }
          }
        } catch (e) {}
      }, 1000);
    } else {
      if (autoSkipInterval.current) clearInterval(autoSkipInterval.current);
    }
    return () => { if (autoSkipInterval.current) clearInterval(autoSkipInterval.current); };
  }, [autoSkip, player, isPlaying, videoId, isAdDetected, isMuted, playlist]);

  // Load YouTube API
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      window.onYouTubeIframeAPIReady = () => setIsApiReady(true);
    } else {
      setIsApiReady(true);
    }
  }, []);

  const extractVideoId = (url: string) => {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
  };

  const handleLoadVideo = (id: string) => {
    setVideoId(id);
    setIsPlaying(true);
    if (silentAudioRef.current) {
      silentAudioRef.current.play().catch(() => {});
      silentAudioRef.current.volume = 0.01;
    }
    if (player) {
      player.loadVideoById(id);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      // Using a public Piped instance for search
      const response = await fetch(`https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(searchQuery)}&filter=videos`);
      const data = await response.json();
      if (data && data.items) {
        setSearchResults(data.items.map((item: any) => ({
          id: item.url.split('v=')[1],
          title: item.title,
          thumbnail: item.thumbnail,
          uploaderName: item.uploaderName,
          duration: item.duration
        })));
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const addToPlaylist = (item: {id: string, title: string, thumbnail: string}) => {
    setPlaylist(prev => {
      if (!prev.some(p => p.id === item.id)) {
        return [...prev, item];
      }
      return prev;
    });
    if (!videoId) handleLoadVideo(item.id);
  };

  const handleUrlAdd = () => {
    const id = extractVideoId(url);
    if (id) {
      addToPlaylist({
        id,
        title: `Música ${playlist.length + 1}`,
        thumbnail: `https://img.youtube.com/vi/${id}/mqdefault.jpg`
      });
      setUrl('');
    }
  };

  const toggleLike = (id: string, title?: string, thumbnail?: string) => {
    setLikedSongs(prev => {
      const index = prev.findIndex(s => s.id === id);
      if (index !== -1) {
        return prev.filter(s => s.id !== id);
      } else {
        // Try to get metadata from playlist if not provided
        const playlistItem = playlist.find(p => p.id === id);
        return [...prev, { 
          id, 
          title: title || playlistItem?.title || 'Música', 
          thumbnail: thumbnail || playlistItem?.thumbnail || '' 
        }];
      }
    });
  };

  const removeFromPlaylist = (id: string) => {
    setPlaylist(prev => prev.filter(p => p.id !== id));
  };

  const createNewPlaylist = () => {
    const name = newPlaylistName.trim() || `Minha Playlist #${userPlaylists.length + 1}`;
    const newPlaylist = {
      id: Date.now().toString(),
      name: name,
      items: trackPendingPlaylist ? [trackPendingPlaylist] : []
    };
    setUserPlaylists(prev => [...prev, newPlaylist]);
    setNewPlaylistName('');
    setTrackPendingPlaylist(null);
    setIsCreatePlaylistModalOpen(false);
  };

  const addToUserPlaylist = (playlistId: string, track: any) => {
    setUserPlaylists(prev => prev.map(pl => {
      if (pl.id === playlistId) {
        if (pl.items.some((item: any) => item.id === track.id)) return pl;
        return { ...pl, items: [...pl.items, track] };
      }
      return pl;
    }));
    setIsAddToPlaylistMenuOpen(null);
    setActiveMenuId(null);
  };

  const removeFromUserPlaylist = (playlistId: string, trackId: string) => {
    setUserPlaylists(prev => prev.map(pl => {
      if (pl.id === playlistId) {
        return { ...pl, items: pl.items.filter((item: any) => item.id !== trackId) };
      }
      return pl;
    }));
  };

  const deletePlaylist = (playlistId: string) => {
    setUserPlaylists(prev => prev.filter(pl => pl.id !== playlistId));
    if (viewingPlaylistId === playlistId) setViewingPlaylistId(null);
  };

  const handleNext = () => {
    if (playlist.length === 0) return;
    const currentIndex = playlist.findIndex(p => p.id === videoId);
    if (isShuffle) {
      const nextIndex = Math.floor(Math.random() * playlist.length);
      handleLoadVideo(playlist[nextIndex].id);
    } else if (currentIndex !== -1 && currentIndex < playlist.length - 1) {
      handleLoadVideo(playlist[currentIndex + 1].id);
    } else if (repeatMode === 'all' || currentIndex === -1) {
      handleLoadVideo(playlist[0].id);
    }
  };

  const handlePrevious = () => {
    if (playlist.length === 0) return;
    const currentIndex = playlist.findIndex(p => p.id === videoId);
    if (currentIndex > 0) {
      handleLoadVideo(playlist[currentIndex - 1].id);
    } else if (repeatMode === 'all' && currentIndex !== -1) {
      handleLoadVideo(playlist[playlist.length - 1].id);
    } else if (currentIndex === -1) {
      handleLoadVideo(playlist[0].id);
    }
  };

  const onPlayerReady = (event: any) => {
    setPlayer(event.target);
    if (stateRef.current.isPlaying) event.target.playVideo();
    
    // Force metadata update on ready
    const { currentTrack } = stateRef.current;
    if (currentTrack.id && 'mediaSession' in navigator) {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: currentTrack.title || 'SkipTube Music',
        artist: 'SkipTube Player',
        album: 'YouTube Music',
        artwork: [
          { src: currentTrack.thumbnail || 'https://picsum.photos/seed/music/512/512', sizes: '512x512', type: 'image/png' },
          { src: `https://img.youtube.com/vi/${currentTrack.id}/mqdefault.jpg`, sizes: '320x180', type: 'image/jpeg' },
          { src: `https://img.youtube.com/vi/${currentTrack.id}/maxresdefault.jpg`, sizes: '1280x720', type: 'image/jpeg' }
        ]
      });
    }
  };

  const onPlayerStateChange = (event: any) => {
    const { videoId, repeatMode, player, currentTrack } = stateRef.current;

    if (event.data === 1) {
      setIsPlaying(true);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
        // Refresh metadata on play
        navigator.mediaSession.metadata = new window.MediaMetadata({
          title: currentTrack.title || 'SkipTube Music',
          artist: 'SkipTube Player',
          artwork: [
            { src: currentTrack.thumbnail || 'https://picsum.photos/seed/music/512/512', sizes: '512x512', type: 'image/png' },
            { src: `https://img.youtube.com/vi/${currentTrack.id}/mqdefault.jpg`, sizes: '320x180', type: 'image/jpeg' }
          ]
        });
      }
      if (silentAudioRef.current) {
        silentAudioRef.current.play().catch(() => {});
        silentAudioRef.current.volume = 0.01;
      }
      const data = event.target.getVideoData();
      if (data?.video_id && data.video_id !== videoId) setVideoId(data.video_id);
      if (data?.title) {
        setPlaylist(prev => prev.map(p => 
          p.id === data.video_id && p.title.startsWith('Track ') 
          ? { ...p, title: data.title } 
          : p
        ));
      }
    }
    if (event.data === 2) {
      setIsPlaying(false);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    }
    if (event.data === 0) {
      if (repeatMode === 'one') {
        player?.playVideo();
      } else {
        handleNext();
      }
    }
  };

  useEffect(() => {
    if (isApiReady && videoId && !player) {
      new window.YT.Player('youtube-player', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: { 
          autoplay: 1, 
          controls: 0, 
          modestbranding: 1, 
          rel: 0, 
          origin: window.location.origin,
          playsinline: 1 
        },
        events: { 
          onReady: (e: any) => onPlayerReady(e), 
          onStateChange: (e: any) => onPlayerStateChange(e) 
        }
      });
    }
  }, [isApiReady, videoId]);

  const togglePlay = () => {
    if (player) {
      if (isPlaying) {
        player.pauseVideo();
        if (silentAudioRef.current) {
          silentAudioRef.current.pause();
        }
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
      } else {
        player.playVideo();
        if (silentAudioRef.current) {
          silentAudioRef.current.play().catch(() => {});
          silentAudioRef.current.volume = 0.01; // Tiny volume to keep it active
        }
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
      }
    }
  };

  // Handle Visibility Change to keep playing
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        if (isPlaying && player) {
          player.playVideo();
        }
        // Re-acquire wake lock if needed
        if (isPlaying && 'wakeLock' in navigator && !wakeLock.current) {
          try {
            wakeLock.current = await (navigator as any).wakeLock.request('screen');
          } catch (err) {}
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isPlaying, player]);

  // Wake Lock Management
  useEffect(() => {
    const requestWakeLock = async () => {
      if (isPlaying && 'wakeLock' in navigator && !wakeLock.current) {
        try {
          wakeLock.current = await (navigator as any).wakeLock.request('screen');
        } catch (err) {}
      } else if (!isPlaying && wakeLock.current) {
        try {
          await wakeLock.current.release();
          wakeLock.current = null;
        } catch (err) {}
      }
    };
    requestWakeLock();
  }, [isPlaying]);

  // Sync Media Session playback state
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [isPlaying]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    player?.seekTo(time, true);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setVolume(val);
    player?.setVolume(val);
    if (val === 0) setIsMuted(true);
    else setIsMuted(false);
  };

  const currentTrack = playlist.find(p => p.id === videoId) || { id: videoId, title: 'Nenhuma música tocando', thumbnail: '' };

  // Media Session API Support
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack.id || !player) return;

    const updateMetadata = () => {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: currentTrack.title || 'SkipTube Music',
        artist: 'SkipTube Player',
        album: 'YouTube Music',
        artwork: [
          { src: currentTrack.thumbnail || 'https://picsum.photos/seed/music/512/512', sizes: '512x512', type: 'image/png' },
          { src: `https://img.youtube.com/vi/${currentTrack.id}/mqdefault.jpg`, sizes: '320x180', type: 'image/jpeg' },
          { src: `https://img.youtube.com/vi/${currentTrack.id}/maxresdefault.jpg`, sizes: '1280x720', type: 'image/jpeg' }
        ]
      });
    };

    updateMetadata();

    // Periodic refresh to ensure it stays active
    const refreshInterval = setInterval(updateMetadata, 10000);
    
    const playAction = () => {
      const { player } = stateRef.current;
      if (player) {
        player.playVideo();
        if (silentAudioRef.current) {
          silentAudioRef.current.play().catch(() => {});
          silentAudioRef.current.volume = 0.01;
        }
        setIsPlaying(true);
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
      }
    };

    const pauseAction = () => {
      const { player } = stateRef.current;
      if (player) {
        player.pauseVideo();
        if (silentAudioRef.current) {
          silentAudioRef.current.pause();
        }
        setIsPlaying(false);
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'paused';
        }
      }
    };

    navigator.mediaSession.setActionHandler('play', playAction);
    navigator.mediaSession.setActionHandler('pause', pauseAction);
    navigator.mediaSession.setActionHandler('previoustrack', () => handlePrevious());
    navigator.mediaSession.setActionHandler('nexttrack', () => handleNext());
    
    try {
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        const { player } = stateRef.current;
        if (details.seekTime !== undefined && player) {
          player.seekTo(details.seekTime, true);
          setCurrentTime(details.seekTime);
        }
      });
    } catch (e) {}

    // Update position state periodically
    const positionInterval = setInterval(() => {
      const { player, isPlaying } = stateRef.current;
      if (player && player.getCurrentTime && player.getDuration) {
        try {
          const currentTime = player.getCurrentTime();
          const duration = player.getDuration();
          
          // Watchdog: If it should be playing but is paused (likely by browser backgrounding)
          // we try to resume it. This works better if silent audio is also playing.
          if (isPlaying) {
            if (player.getPlayerState && player.getPlayerState() === 2) {
              player.playVideo();
            }
            if (silentAudioRef.current && silentAudioRef.current.paused) {
              silentAudioRef.current.play().catch(() => {});
            }
          }

          if (!isNaN(currentTime) && !isNaN(duration) && duration > 0) {
            navigator.mediaSession.setPositionState({
              duration: duration,
              playbackRate: player.getPlaybackRate() || 1,
              position: currentTime
            });
          }
        } catch (e) {}
      }
    }, 2000);

    return () => {
      clearInterval(positionInterval);
      clearInterval(refreshInterval);
    };
  }, [currentTrack.id, currentTrack.title, player]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans overflow-hidden flex flex-col">
      {/* Splash Screen Animation */}
      <AnimatePresence>
        {showSplash && (
          <motion.div
            key="splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 z-[1000] bg-black flex flex-col items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ 
                type: "spring",
                stiffness: 260,
                damping: 20,
                delay: 0.2
              }}
              className="relative"
            >
              <div className="w-32 h-32 bg-[#1DB954] rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(29,185,84,0.3)]">
                <Music2 className="w-16 h-16 text-black" />
              </div>
              <motion.div
                animate={{ 
                  scale: [1, 1.2, 1],
                  opacity: [0.3, 0.6, 0.3]
                }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="absolute inset-0 bg-[#1DB954] rounded-full -z-10 blur-2xl"
              />
            </motion.div>
            
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-8 text-center"
            >
              <h1 className="text-4xl font-black tracking-tighter text-white mb-2">SkipTube</h1>
              <p className="text-zinc-500 font-medium tracking-widest uppercase text-[10px]">Premium Music Experience</p>
            </motion.div>

            <motion.div 
              className="absolute bottom-12 left-0 right-0 flex justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
            >
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ height: [4, 16, 4] }}
                    transition={{ 
                      duration: 0.6, 
                      repeat: Infinity, 
                      delay: i * 0.1,
                      ease: "easeInOut"
                    }}
                    className="w-1 bg-[#1DB954] rounded-full"
                  />
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Persistent YouTube Player Container */}
      <div 
        className={`fixed z-[70] transition-all duration-500 pointer-events-none ${
          isNowPlayingOpen 
            ? 'top-[15%] left-8 right-8 aspect-square opacity-100 scale-100' 
            : 'top-0 left-0 w-1 h-1 opacity-[0.001] scale-[0.001]'
        }`}
      >
        <div className="w-full h-full rounded-xl overflow-hidden shadow-2xl bg-zinc-900 border border-white/5 pointer-events-auto">
          <div id="youtube-player" className="w-full h-full"></div>
        </div>
      </div>

      {/* Hidden Silent Audio for Background Playback */}
      <audio 
        ref={silentAudioRef} 
        loop 
        className="hidden"
        src="https://www.soundjay.com/button/beep-01a.mp3" // Using a real (but very quiet) audio file as fallback if data uri fails
        onPlay={(e) => { e.currentTarget.volume = 0.001; }}
      />

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto pb-32 px-4 pt-8">
        {activeTab === 'home' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold">{getGreeting()}</h1>
              <div className="flex gap-4">
                <button onClick={() => setAutoSkip(!autoSkip)} className={autoSkip ? 'text-[#1DB954]' : 'text-zinc-500'}>
                  <Zap className="w-6 h-6" />
                </button>
                <button onClick={() => setShowInfo(!showInfo)} className="text-zinc-500">
                  <Info className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {playlist.slice(0, 6).map((item) => (
                <div 
                  key={item.id} 
                  onClick={() => handleLoadVideo(item.id)}
                  className="bg-zinc-800/50 rounded-md flex items-center gap-3 overflow-hidden hover:bg-zinc-700/50 transition-colors cursor-pointer"
                >
                  <img src={item.thumbnail} className="w-14 h-14 object-cover" alt="" referrerPolicy="no-referrer" />
                  <span className="text-xs font-bold truncate pr-2">{item.title}</span>
                </div>
              ))}
            </div>

            <section>
              <h2 className="text-xl font-bold mb-4">Sua Playlist</h2>
              <div className="space-y-4">
                {playlist.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500">
                    <Music2 className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>Sua playlist está vazia. Vá em Buscar para adicionar músicas.</p>
                  </div>
                ) : (
                  playlist.map((item) => (
                    <div key={item.id} className="flex items-center justify-between group relative">
                      <div onClick={() => handleLoadVideo(item.id)} className="flex items-center gap-3 flex-1 cursor-pointer">
                        <img src={item.thumbnail} className="w-12 h-12 rounded object-cover" alt="" referrerPolicy="no-referrer" />
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${item.id === videoId ? 'text-[#1DB954]' : 'text-white'}`}>{item.title}</p>
                          <p className="text-xs text-zinc-400">Vídeo do YouTube</p>
                        </div>
                      </div>
                      <div className="relative">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(activeMenuId === item.id ? null : item.id);
                          }} 
                          className="p-2 text-zinc-500 hover:text-white transition-colors"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                        <AnimatePresence>
                          {activeMenuId === item.id && (
                            <>
                              <div 
                                className="fixed inset-0 z-[80]" 
                                onClick={() => setActiveMenuId(null)}
                              />
                              <motion.div 
                                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                className="absolute right-0 top-10 bg-zinc-800 rounded-lg shadow-xl border border-white/10 py-1 w-48 z-[90]"
                              >
                                <button 
                                  onClick={() => {
                                    toggleLike(item.id, item.title, item.thumbnail);
                                    setActiveMenuId(null);
                                  }}
                                  className="w-full text-left px-4 py-2 hover:bg-zinc-700 flex items-center gap-3 text-sm"
                                >
                                  <Heart className={`w-4 h-4 ${likedSongs.some(s => s.id === item.id) ? 'fill-[#1DB954] text-[#1DB954]' : ''}`} />
                                  {likedSongs.some(s => s.id === item.id) ? 'Remover das Curtidas' : 'Curtir'}
                                </button>
                                <button 
                                  onClick={() => {
                                    setIsAddToPlaylistMenuOpen(item);
                                    setActiveMenuId(null);
                                  }}
                                  className="w-full text-left px-4 py-2 hover:bg-zinc-700 flex items-center gap-3 text-sm"
                                >
                                  <Plus className="w-4 h-4" />
                                  Adicionar à Playlist...
                                </button>
                                <button 
                                  onClick={() => {
                                    removeFromPlaylist(item.id);
                                    setActiveMenuId(null);
                                  }}
                                  className="w-full text-left px-4 py-2 hover:bg-zinc-700 flex items-center gap-3 text-sm text-red-400"
                                >
                                  <Plus className="w-4 h-4 rotate-45" />
                                  Remover da Fila
                                </button>
                              </motion.div>
                            </>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </motion.div>
        )}

        {activeTab === 'search' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <h1 className="text-3xl font-bold">Buscar</h1>
            
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-black" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="O que você quer ouvir?"
                className="w-full bg-white text-black rounded-md py-3 pl-12 pr-4 font-medium focus:outline-none"
              />
              {isSearching && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </form>

            <div className="space-y-4">
              {searchResults.length > 0 ? (
                <div className="space-y-4">
                  <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Resultados</h2>
                  {searchResults.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 group">
                      <div className="relative w-12 h-12 flex-shrink-0">
                        <img src={item.thumbnail} className="w-full h-full object-cover rounded" alt="" referrerPolicy="no-referrer" />
                        <button 
                          onClick={() => handleLoadVideo(item.id)}
                          className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Play className="w-6 h-6 fill-white" />
                        </button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">{item.title}</p>
                        <p className="text-xs text-zinc-400 truncate">{item.uploaderName}</p>
                      </div>
                      <div className="relative">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(activeMenuId === item.id ? null : item.id);
                          }} 
                          className="p-2 text-zinc-400 hover:text-white"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                        <AnimatePresence>
                          {activeMenuId === item.id && (
                            <>
                              <div 
                                className="fixed inset-0 z-[80]" 
                                onClick={() => setActiveMenuId(null)}
                              />
                              <motion.div 
                                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                className="absolute right-0 top-10 bg-zinc-800 rounded-lg shadow-xl border border-white/10 py-1 w-48 z-[90]"
                              >
                                <button 
                                  onClick={() => {
                                    toggleLike(item.id, item.title, item.thumbnail);
                                    setActiveMenuId(null);
                                  }}
                                  className="w-full text-left px-4 py-2 hover:bg-zinc-700 flex items-center gap-3 text-sm"
                                >
                                  <Heart className={`w-4 h-4 ${likedSongs.some(s => s.id === item.id) ? 'fill-[#1DB954] text-[#1DB954]' : ''}`} />
                                  {likedSongs.some(s => s.id === item.id) ? 'Remover das Curtidas' : 'Curtir'}
                                </button>
                                <button 
                                  onClick={() => {
                                    setIsAddToPlaylistMenuOpen(item);
                                    setActiveMenuId(null);
                                  }}
                                  className="w-full text-left px-4 py-2 hover:bg-zinc-700 flex items-center gap-3 text-sm"
                                >
                                  <Plus className="w-4 h-4" />
                                  Adicionar à Playlist...
                                </button>
                                <button 
                                  onClick={() => {
                                    addToPlaylist({ id: item.id, title: item.title, thumbnail: item.thumbnail });
                                    setActiveMenuId(null);
                                  }}
                                  className="w-full text-left px-4 py-2 hover:bg-zinc-700 flex items-center gap-3 text-sm"
                                >
                                  <Play className="w-4 h-4" />
                                  Adicionar à Fila
                                </button>
                              </motion.div>
                            </>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {['Pop', 'Rock', 'Hip-Hop', 'Jazz', 'Eletrônica', 'Clássica'].map(genre => (
                    <div key={genre} className="h-24 rounded-lg bg-zinc-800 p-3 font-bold text-lg relative overflow-hidden cursor-pointer hover:bg-zinc-700 transition-colors">
                      {genre}
                      <div className="absolute -right-2 -bottom-2 w-16 h-16 bg-zinc-700 rotate-12 rounded shadow-xl" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-8 space-y-4">
              <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Adicionar por URL</h2>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Cole o link do YouTube aqui..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="flex-1 bg-zinc-800 text-white py-2 px-4 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-white/20"
                />
                <button 
                  onClick={handleUrlAdd}
                  className="bg-white text-black px-4 py-2 rounded-md font-bold text-sm"
                >
                  Adicionar
                </button>
              </div>
            </div>
          </motion.div>
        )}

         {activeTab === 'library' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
             <div className="flex items-center gap-4">
               {(viewingLiked || viewingPlaylistId) ? (
                 <button onClick={() => { setViewingLiked(false); setViewingPlaylistId(null); }} className="p-2 -ml-2">
                   <SkipBack className="w-6 h-6" />
                 </button>
               ) : (
                 <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-xl font-bold">W</div>
               )}
               <h1 className="text-2xl font-bold">
                 {viewingLiked ? 'Músicas Curtidas' : viewingPlaylistId ? userPlaylists.find(pl => pl.id === viewingPlaylistId)?.name : 'Sua Biblioteca'}
               </h1>
             </div>

             {!viewingLiked && !viewingPlaylistId ? (
               <>
                 <div className="flex gap-2">
                   <span className="px-3 py-1 rounded-full border border-zinc-700 text-xs font-medium">Playlists</span>
                   <span className="px-3 py-1 rounded-full border border-zinc-700 text-xs font-medium">Artistas</span>
                 </div>
                 <div 
                   onClick={() => setViewingLiked(true)}
                   className="flex items-center gap-4 p-2 cursor-pointer hover:bg-zinc-900 rounded-lg transition-colors"
                 >
                   <div className="w-16 h-16 bg-gradient-to-br from-indigo-700 to-emerald-400 rounded flex items-center justify-center shadow-lg">
                     <Heart className="w-8 h-8 fill-white text-white" />
                   </div>
                   <div>
                     <p className="font-bold">Músicas Curtidas</p>
                     <p className="text-xs text-zinc-400">Playlist • {likedSongs.length} músicas</p>
                   </div>
                 </div>

                 <div className="space-y-4 pt-4">
                   <h3 className="font-bold text-sm">Suas Playlists</h3>
                   <div 
                     onClick={() => setIsCreatePlaylistModalOpen(true)}
                     className="flex items-center gap-4 p-2 cursor-pointer hover:bg-zinc-900 rounded-lg transition-colors"
                   >
                     <div className="w-16 h-16 bg-zinc-800 rounded flex items-center justify-center">
                       <Plus className="w-8 h-8 text-zinc-500" />
                     </div>
                     <p className="font-bold">Criar Nova Playlist</p>
                   </div>

                   {userPlaylists.map(pl => (
                     <div key={pl.id} className="flex items-center justify-between p-2 group relative">
                       <div 
                         onClick={() => setViewingPlaylistId(pl.id)}
                         className="flex items-center gap-4 flex-1 cursor-pointer min-w-0"
                       >
                         <div className="w-16 h-16 bg-zinc-800 rounded flex items-center justify-center overflow-hidden">
                           {pl.items.length > 0 ? (
                             <img src={pl.items[0].thumbnail} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                           ) : (
                             <Music2 className="w-8 h-8 text-zinc-600" />
                           )}
                         </div>
                         <div className="min-w-0">
                           <p className="font-bold truncate">{pl.name}</p>
                           <p className="text-xs text-zinc-400">Playlist • {pl.items.length} músicas</p>
                         </div>
                       </div>
                       <button 
                         onClick={() => deletePlaylist(pl.id)}
                         className="p-2 text-zinc-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                       >
                         <Plus className="w-5 h-5 rotate-45" />
                       </button>
                     </div>
                   ))}
                   
                   <h3 className="font-bold text-sm pt-4">Fila de Reprodução</h3>
                   {playlist.map(item => (
                     <div key={item.id} className="flex items-center justify-between p-2 group relative">
                       <div onClick={() => handleLoadVideo(item.id)} className="flex items-center gap-4 flex-1 cursor-pointer min-w-0">
                         <img 
                           src={item.thumbnail} 
                           className="w-16 h-16 rounded object-cover" 
                           alt="" 
                           referrerPolicy="no-referrer"
                         />
                         <div className="min-w-0">
                           <p className={`font-bold truncate ${item.id === videoId ? 'text-[#1DB954]' : 'text-white'}`}>{item.title}</p>
                           <p className="text-xs text-zinc-400">Música</p>
                         </div>
                       </div>
                       <div className="relative">
                         <button 
                           onClick={(e) => {
                             e.stopPropagation();
                             setActiveMenuId(activeMenuId === item.id ? null : item.id);
                           }} 
                           className="p-2 text-zinc-500 hover:text-white transition-colors"
                         >
                           <MoreVertical className="w-5 h-5" />
                         </button>
                         <AnimatePresence>
                           {activeMenuId === item.id && (
                             <>
                               <div 
                                 className="fixed inset-0 z-[80]" 
                                 onClick={() => setActiveMenuId(null)}
                               />
                               <motion.div 
                                 initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                 animate={{ opacity: 1, scale: 1, y: 0 }}
                                 exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                 className="absolute right-0 top-10 bg-zinc-800 rounded-lg shadow-xl border border-white/10 py-1 w-48 z-[90]"
                               >
                                 <button 
                                   onClick={() => {
                                     toggleLike(item.id, item.title, item.thumbnail);
                                     setActiveMenuId(null);
                                   }}
                                   className="w-full text-left px-4 py-2 hover:bg-zinc-700 flex items-center gap-3 text-sm"
                                 >
                                   <Heart className={`w-4 h-4 ${likedSongs.some(s => s.id === item.id) ? 'fill-[#1DB954] text-[#1DB954]' : ''}`} />
                                   {likedSongs.some(s => s.id === item.id) ? 'Remover das Curtidas' : 'Curtir'}
                                 </button>
                                 <button 
                                   onClick={() => {
                                     setIsAddToPlaylistMenuOpen(item);
                                     setActiveMenuId(null);
                                   }}
                                   className="w-full text-left px-4 py-2 hover:bg-zinc-700 flex items-center gap-3 text-sm"
                                 >
                                   <Plus className="w-4 h-4" />
                                   Adicionar à Playlist...
                                 </button>
                                 <button 
                                   onClick={() => {
                                     removeFromPlaylist(item.id);
                                     setActiveMenuId(null);
                                   }}
                                   className="w-full text-left px-4 py-2 hover:bg-zinc-700 flex items-center gap-3 text-sm text-red-400"
                                 >
                                   <Plus className="w-4 h-4 rotate-45" />
                                   Remover da Fila
                                 </button>
                               </motion.div>
                             </>
                           )}
                         </AnimatePresence>
                       </div>
                     </div>
                   ))}
                 </div>
               </>
             ) : (
               <div className="space-y-4">
                 {viewingLiked ? (
                   likedSongs.length === 0 ? (
                     <div className="text-center py-20 text-zinc-500">
                       <Heart className="w-16 h-16 mx-auto mb-4 opacity-10" />
                       <p>Você ainda não curtiu nenhuma música.</p>
                     </div>
                   ) : (
                     likedSongs.map(item => (
                       <div key={item.id} className="flex items-center justify-between p-2 group relative">
                         <div onClick={() => handleLoadVideo(item.id)} className="flex items-center gap-4 flex-1 cursor-pointer min-w-0">
                           <img 
                             src={item.thumbnail} 
                             className="w-16 h-16 rounded object-cover" 
                             alt="" 
                             referrerPolicy="no-referrer"
                           />
                           <div className="min-w-0">
                             <p className={`font-bold truncate ${item.id === videoId ? 'text-[#1DB954]' : 'text-white'}`}>{item.title}</p>
                             <p className="text-xs text-zinc-400">Música</p>
                           </div>
                         </div>
                         <div className="relative">
                           <button 
                             onClick={(e) => {
                               e.stopPropagation();
                               setActiveMenuId(activeMenuId === item.id ? null : item.id);
                             }} 
                             className="p-2 text-zinc-500 hover:text-white transition-colors"
                           >
                             <MoreVertical className="w-5 h-5" />
                           </button>
                           <AnimatePresence>
                             {activeMenuId === item.id && (
                               <>
                                 <div 
                                   className="fixed inset-0 z-[80]" 
                                   onClick={() => setActiveMenuId(null)}
                                 />
                                 <motion.div 
                                   initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                   animate={{ opacity: 1, scale: 1, y: 0 }}
                                   exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                   className="absolute right-0 top-10 bg-zinc-800 rounded-lg shadow-xl border border-white/10 py-1 w-48 z-[90]"
                                 >
                                   <button 
                                     onClick={() => {
                                       toggleLike(item.id, item.title, item.thumbnail);
                                       setActiveMenuId(null);
                                     }}
                                     className="w-full text-left px-4 py-2 hover:bg-zinc-700 flex items-center gap-3 text-sm"
                                   >
                                     <Heart className="w-4 h-4 fill-[#1DB954] text-[#1DB954]" />
                                     Remover das Curtidas
                                   </button>
                                   <button 
                                     onClick={() => {
                                       addToPlaylist({ id: item.id, title: item.title, thumbnail: item.thumbnail });
                                       setActiveMenuId(null);
                                     }}
                                     className="w-full text-left px-4 py-2 hover:bg-zinc-700 flex items-center gap-3 text-sm"
                                   >
                                     <Plus className="w-4 h-4" />
                                     Adicionar à Fila
                                   </button>
                                 </motion.div>
                               </>
                             )}
                           </AnimatePresence>
                         </div>
                       </div>
                     ))
                   )
                 ) : viewingPlaylistId ? (
                   userPlaylists.find(pl => pl.id === viewingPlaylistId)?.items.length === 0 ? (
                     <div className="text-center py-20 text-zinc-500">
                       <Music2 className="w-16 h-16 mx-auto mb-4 opacity-10" />
                       <p>Esta playlist está vazia.</p>
                     </div>
                   ) : (
                     userPlaylists.find(pl => pl.id === viewingPlaylistId)?.items.map(item => (
                       <div key={item.id} className="flex items-center justify-between p-2 group relative">
                         <div onClick={() => handleLoadVideo(item.id)} className="flex items-center gap-4 flex-1 cursor-pointer min-w-0">
                           <img 
                             src={item.thumbnail} 
                             className="w-16 h-16 rounded object-cover" 
                             alt="" 
                             referrerPolicy="no-referrer"
                           />
                           <div className="min-w-0">
                             <p className={`font-bold truncate ${item.id === videoId ? 'text-[#1DB954]' : 'text-white'}`}>{item.title}</p>
                             <p className="text-xs text-zinc-400">Música</p>
                           </div>
                         </div>
                         <div className="relative">
                           <button 
                             onClick={(e) => {
                               e.stopPropagation();
                               setActiveMenuId(activeMenuId === item.id ? null : item.id);
                             }} 
                             className="p-2 text-zinc-500 hover:text-white transition-colors"
                           >
                             <MoreVertical className="w-5 h-5" />
                           </button>
                           <AnimatePresence>
                             {activeMenuId === item.id && (
                               <>
                                 <div 
                                   className="fixed inset-0 z-[80]" 
                                   onClick={() => setActiveMenuId(null)}
                                 />
                                 <motion.div 
                                   initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                   animate={{ opacity: 1, scale: 1, y: 0 }}
                                   exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                   className="absolute right-0 top-10 bg-zinc-800 rounded-lg shadow-xl border border-white/10 py-1 w-48 z-[90]"
                                 >
                                   <button 
                                     onClick={() => {
                                       toggleLike(item.id, item.title, item.thumbnail);
                                       setActiveMenuId(null);
                                     }}
                                     className="w-full text-left px-4 py-2 hover:bg-zinc-700 flex items-center gap-3 text-sm"
                                   >
                                     <Heart className={`w-4 h-4 ${likedSongs.some(s => s.id === item.id) ? 'fill-[#1DB954] text-[#1DB954]' : ''}`} />
                                     {likedSongs.some(s => s.id === item.id) ? 'Remover das Curtidas' : 'Curtir'}
                                   </button>
                                   <button 
                                     onClick={() => {
                                       addToPlaylist({ id: item.id, title: item.title, thumbnail: item.thumbnail });
                                       setActiveMenuId(null);
                                     }}
                                     className="w-full text-left px-4 py-2 hover:bg-zinc-700 flex items-center gap-3 text-sm"
                                   >
                                     <Plus className="w-4 h-4" />
                                     Adicionar à Fila
                                   </button>
                                   <button 
                                     onClick={() => {
                                       removeFromUserPlaylist(viewingPlaylistId!, item.id);
                                       setActiveMenuId(null);
                                     }}
                                     className="w-full text-left px-4 py-2 hover:bg-zinc-700 flex items-center gap-3 text-sm text-red-400"
                                   >
                                     <Plus className="w-4 h-4 rotate-45" />
                                     Remover da Playlist
                                   </button>
                                 </motion.div>
                               </>
                             )}
                           </AnimatePresence>
                         </div>
                       </div>
                     ))
                   )
                 ) : null}
               </div>
             )}
          </motion.div>
        )}
      </div>

      {/* Mini Player / Bottom Bar */}
      <AnimatePresence>
        {videoId && !isNowPlayingOpen && (
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-[72px] left-2 right-2 z-40"
          >
            <div 
              onClick={() => setIsNowPlayingOpen(true)}
              className="bg-zinc-900 rounded-lg p-2 flex items-center gap-3 shadow-2xl border border-white/5"
            >
              <img src={currentTrack.thumbnail} className="w-10 h-10 rounded object-cover" alt="" referrerPolicy="no-referrer" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">{currentTrack.title}</p>
                <p className="text-[10px] text-zinc-400">Vídeo do YouTube</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="p-2">
                  {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
                </button>
              </div>
            </div>
            {/* Progress Bar Mini */}
            <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-zinc-700 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-white"
                style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info Modal */}
      <AnimatePresence>
        {showInfo && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setShowInfo(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-zinc-900 border border-white/10 p-6 rounded-2xl w-full max-w-md relative z-[501] shadow-2xl overflow-y-auto max-h-[80vh]"
            >
              <h2 className="text-2xl font-bold mb-6">Sobre o SkipTube</h2>
              <div className="space-y-6 text-sm text-zinc-300">
                <section>
                  <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-[#1DB954]" />
                    Segundo Plano (Background)
                  </h3>
                  <p className="leading-relaxed">
                    Para ouvir com a tela bloqueada:
                    <ol className="list-decimal list-inside mt-2 space-y-1">
                      <li>Dê o play na música.</li>
                      <li>Bloqueie a tela.</li>
                      <li>Se parar, use os controles que aparecerão na tela de bloqueio para dar Play novamente.</li>
                    </ol>
                  </p>
                </section>

                <section>
                  <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-[#1DB954]" />
                    Modo Turbo (Auto-Skip)
                  </h3>
                  <p className="leading-relaxed">
                    O SkipTube detecta e pula anúncios automaticamente, silenciando o áudio durante o processo para uma experiência sem interrupções.
                  </p>
                </section>

                <section>
                  <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-[#1DB954]" />
                    Instalação PWA
                  </h3>
                  <p className="leading-relaxed">
                    Adicione o SkipTube à sua tela de início para usá-lo como um aplicativo nativo.
                  </p>
                </section>
              </div>
              <button 
                onClick={() => setShowInfo(false)}
                className="w-full mt-8 py-3 rounded-full font-bold bg-white text-black hover:scale-105 transition-transform"
              >
                Entendi
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Playlist Modal */}
      <AnimatePresence>
        {isCreatePlaylistModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setIsCreatePlaylistModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-zinc-900 border border-white/10 p-8 rounded-2xl w-full max-w-md relative z-[201] shadow-2xl"
            >
              <h2 className="text-2xl font-bold mb-6">Nova Playlist</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Nome da Playlist</label>
                  <input 
                    type="text" 
                    autoFocus
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createNewPlaylist()}
                    placeholder="Minha Playlist #1"
                    className="w-full bg-zinc-800 border border-transparent focus:border-zinc-700 rounded-lg p-4 text-white outline-none transition-colors"
                  />
                </div>
                <div className="flex gap-4 pt-4">
                  <button 
                    onClick={() => setIsCreatePlaylistModalOpen(false)}
                    className="flex-1 py-3 rounded-full font-bold hover:bg-white/5 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={createNewPlaylist}
                    className="flex-1 py-3 rounded-full font-bold bg-[#1DB954] text-black hover:scale-105 transition-transform"
                  >
                    Criar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add to Playlist Modal */}
      <AnimatePresence>
        {isAddToPlaylistMenuOpen && (
          <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setIsAddToPlaylistMenuOpen(null)}
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="bg-zinc-900 border-t sm:border border-white/10 p-6 rounded-t-3xl sm:rounded-2xl w-full max-w-md relative z-[301] shadow-2xl max-h-[80vh] overflow-y-auto"
            >
              <div className="w-12 h-1.5 bg-zinc-700 rounded-full mx-auto mb-6 sm:hidden" />
              <h2 className="text-xl font-bold mb-6">Adicionar à Playlist</h2>
              <div className="space-y-2">
                <button 
                  onClick={() => {
                    setTrackPendingPlaylist(isAddToPlaylistMenuOpen);
                    setIsCreatePlaylistModalOpen(true);
                    setIsAddToPlaylistMenuOpen(null);
                  }}
                  className="w-full flex items-center gap-4 p-3 hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  <div className="w-12 h-12 bg-zinc-800 rounded flex items-center justify-center">
                    <Plus className="w-6 h-6" />
                  </div>
                  <span className="font-bold">Nova Playlist</span>
                </button>
                
                {userPlaylists.length === 0 ? (
                  <p className="text-center py-8 text-zinc-500 text-sm">Você não tem playlists criadas.</p>
                ) : (
                  userPlaylists.map(pl => (
                    <button 
                      key={pl.id}
                      onClick={() => addToUserPlaylist(pl.id, isAddToPlaylistMenuOpen)}
                      className="w-full flex items-center gap-4 p-3 hover:bg-zinc-800 rounded-lg transition-colors"
                    >
                      <div className="w-12 h-12 bg-zinc-800 rounded flex items-center justify-center overflow-hidden">
                        {pl.items.length > 0 ? (
                          <img src={pl.items[0].thumbnail} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                        ) : (
                          <Music2 className="w-6 h-6 text-zinc-600" />
                        )}
                      </div>
                      <div className="text-left">
                        <p className="font-bold">{pl.name}</p>
                        <p className="text-xs text-zinc-400">{pl.items.length} músicas</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
              <button 
                onClick={() => setIsAddToPlaylistMenuOpen(null)}
                className="w-full mt-6 py-3 rounded-full font-bold bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                Fechar
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation */}
      <nav className="bg-black/90 backdrop-blur-md border-t border-white/5 h-[72px] flex items-center justify-around px-6 fixed bottom-0 left-0 right-0 z-50">
        <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 ${activeTab === 'home' ? 'text-white' : 'text-zinc-500'}`}>
          <Home className="w-6 h-6" />
          <span className="text-[10px] font-medium">Início</span>
        </button>
        <button onClick={() => setActiveTab('search')} className={`flex flex-col items-center gap-1 ${activeTab === 'search' ? 'text-white' : 'text-zinc-500'}`}>
          <Search className="w-6 h-6" />
          <span className="text-[10px] font-medium">Buscar</span>
        </button>
        <button onClick={() => setActiveTab('library')} className={`flex flex-col items-center gap-1 ${activeTab === 'library' ? 'text-white' : 'text-zinc-500'}`}>
          <Library className="w-6 h-6" />
          <span className="text-[10px] font-medium">Sua Biblioteca</span>
        </button>
      </nav>

      {/* Full Screen Now Playing */}
      <AnimatePresence>
        {isNowPlayingOpen && (
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 bg-gradient-to-b from-zinc-800 to-black z-[60] p-6 flex flex-col"
          >
            <div className="flex items-center justify-between mb-8">
              <button onClick={() => setIsNowPlayingOpen(false)}>
                <ChevronDown className="w-8 h-8" />
              </button>
              <span className="text-xs font-bold uppercase tracking-widest">Tocando Agora</span>
              <div className="relative">
                <button onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}>
                  <MoreVertical className="w-6 h-6" />
                </button>
                <AnimatePresence>
                  {isMoreMenuOpen && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      className="absolute right-0 top-10 bg-zinc-800 rounded-lg shadow-xl border border-white/10 py-2 w-56 z-[80]"
                    >
                      {playlist.some(p => p.id === currentTrack.id) ? (
                        <button 
                          onClick={() => {
                            removeFromPlaylist(currentTrack.id);
                            setIsMoreMenuOpen(false);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-zinc-700 flex items-center gap-3 text-sm text-red-400"
                        >
                          <Plus className="w-4 h-4 rotate-45" />
                          Remover da Playlist
                        </button>
                      ) : (
                        <button 
                          onClick={() => {
                            addToPlaylist({
                              id: currentTrack.id,
                              title: currentTrack.title,
                              thumbnail: currentTrack.thumbnail
                            });
                            setIsMoreMenuOpen(false);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-zinc-700 flex items-center gap-3 text-sm"
                        >
                          <Plus className="w-4 h-4" />
                          Adicionar à Playlist
                        </button>
                      )}
                      <button 
                        onClick={() => {
                          toggleLike(currentTrack.id, currentTrack.title, currentTrack.thumbnail);
                          setIsMoreMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-zinc-700 flex items-center gap-3 text-sm"
                      >
                        <Heart className={`w-4 h-4 ${likedSongs.some(s => s.id === currentTrack.id) ? 'fill-[#1DB954] text-[#1DB954]' : ''}`} />
                        {likedSongs.some(s => s.id === currentTrack.id) ? 'Remover das Curtidas' : 'Curtir'}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-between py-2">
              {/* Spacer for persistent player */}
              <div className="w-full aspect-square" />

              <div className="w-full space-y-1 mt-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0 pr-4 overflow-hidden">
                    <motion.div 
                      animate={{ x: currentTrack.title.length > 25 ? [0, -100, 0] : 0 }}
                      transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                      className="whitespace-nowrap"
                    >
                      <h2 className="text-xl font-bold inline-block">{currentTrack.title}</h2>
                    </motion.div>
                    <p className="text-sm text-zinc-400">Vídeo do YouTube</p>
                  </div>
                  <button 
                    onClick={() => toggleLike(currentTrack.id, currentTrack.title, currentTrack.thumbnail)}
                    className={`p-2 transition-colors ${likedSongs.some(s => s.id === currentTrack.id) ? 'text-[#1DB954]' : 'text-zinc-400'}`}
                  >
                    <Heart className={`w-6 h-6 ${likedSongs.some(s => s.id === currentTrack.id) ? 'fill-current' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full space-y-1 mt-4">
                <input 
                  type="range"
                  min="0"
                  max={duration || 0}
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-white"
                />
                <div className="flex justify-between text-[10px] text-zinc-500 font-medium">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Controls */}
              <div className="w-full flex items-center justify-between px-4 mt-4">
                <button 
                  onClick={() => setIsShuffle(!isShuffle)}
                  className={`p-2 transition-colors ${isShuffle ? 'text-[#1DB954]' : 'text-zinc-500'}`}
                >
                  <Shuffle className="w-4 h-4" />
                </button>
                <button 
                  onClick={handlePrevious} 
                  className="p-2 text-white hover:text-[#1DB954] transition-colors active:scale-90"
                >
                  <SkipBack className="w-6 h-6 fill-current" />
                </button>
                <button 
                  onClick={togglePlay}
                  className="w-12 h-12 bg-white text-black rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-all hover:scale-105"
                >
                  {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                </button>
                <button 
                  onClick={handleNext} 
                  className="p-2 text-white hover:text-[#1DB954] transition-colors active:scale-90"
                >
                  <SkipForward className="w-6 h-6 fill-current" />
                </button>
                <button 
                  onClick={() => setRepeatMode(prev => prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off')}
                  className={`p-2 transition-colors ${repeatMode !== 'off' ? 'text-[#1DB954]' : 'text-zinc-500'}`}
                >
                  {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
                </button>
              </div>

              {/* Volume & Device */}
              <div className="w-full flex items-center gap-3 mt-6">
                <button onClick={() => setIsMuted(!isMuted)} className="text-zinc-400 p-1">
                  {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input 
                  type="range"
                  min="0"
                  max="100"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="flex-1 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-white"
                />
                <Smartphone className="w-4 h-4 text-zinc-400" />
              </div>
            </div>

            {/* Ad Alert in Full Screen */}
            <AnimatePresence>
              {isAdDetected && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-[#1DB954] text-black px-4 py-3 rounded-2xl text-center font-bold text-sm mb-8 animate-pulse"
                >
                  🚀 MODO TURBO: PULANDO ANÚNCIO...
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
