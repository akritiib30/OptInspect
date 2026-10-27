// Joins a silent video with narration clips into one MP4, using the video editing engine built into Windows.
// Nothing is downloaded. Build with build_winmux.ps1, run:  WinMux.exe video.mp4 out.mp4 720|1080 "clip1.wav@0.5;clip2.wav@7.25" [bitsPerSecond]
using System;
using System.IO;
using System.Threading;
using Windows.Foundation;
using Windows.Media.Editing;
using Windows.Media.MediaProperties;
using Windows.Storage;

public static class WinMux
{
    // Windows async operations report completion through a callback; wait for it and take the result.
    static T Wait<T>(IAsyncOperation<T> op)
    {
        var done = new ManualResetEvent(false);
        op.Completed = (o, s) => done.Set();
        done.WaitOne();
        if (op.Status == AsyncStatus.Error) throw op.ErrorCode;
        return op.GetResults();
    }

    static R Wait<R, P>(IAsyncOperationWithProgress<R, P> op)
    {
        var done = new ManualResetEvent(false);
        op.Completed = (o, s) => done.Set();
        done.WaitOne();
        if (op.Status == AsyncStatus.Error) throw op.ErrorCode;
        return op.GetResults();
    }

    public static int Main(string[] args)
    {
        if (args.Length < 4) { Console.Error.WriteLine("usage: WinMux video out 720|1080 \"a.wav@0.5;b.wav@7\""); return 2; }
        try
        {
            var comp = new MediaComposition();
            var vf = Wait(StorageFile.GetFileFromPathAsync(Path.GetFullPath(args[0])));
            comp.Clips.Add(Wait(MediaClip.CreateFromFileAsync(vf)));
            foreach (var item in args[3].Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var parts = item.Split('@');
                var af = Wait(StorageFile.GetFileFromPathAsync(Path.GetFullPath(parts[0])));
                var track = Wait(BackgroundAudioTrack.CreateFromFileAsync(af));
                track.Delay = TimeSpan.FromSeconds(double.Parse(parts[1], System.Globalization.CultureInfo.InvariantCulture));
                comp.BackgroundAudioTracks.Add(track);
            }
            string full = Path.GetFullPath(args[1]);
            var folder = Wait(StorageFolder.GetFolderFromPathAsync(Path.GetDirectoryName(full)));
            var dest = Wait(folder.CreateFileAsync(Path.GetFileName(full), CreationCollisionOption.ReplaceExisting));
            var profile = MediaEncodingProfile.CreateMp4(args[2] == "1080" ? VideoEncodingQuality.HD1080p : VideoEncodingQuality.HD720p);
            if (args.Length > 4) profile.Video.Bitrate = uint.Parse(args[4]);   // bits per second, e.g. 5000000
            var reason = Wait(comp.RenderToFileAsync(dest, MediaTrimmingPreference.Fast, profile));
            Console.WriteLine("result: " + reason + ", bytes: " + new FileInfo(full).Length);
            return new FileInfo(full).Length > 0 ? 0 : 1;
        }
        catch (Exception e)
        {
            Console.Error.WriteLine("failed: " + e.Message);
            return 1;
        }
    }
}
