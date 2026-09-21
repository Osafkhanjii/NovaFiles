param(
    [string]$PathsJson,
    [int]$TargetSize,
    [string]$CacheDir
)

$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Drawing

$code = @"
using System;
using System.Drawing;
using System.Runtime.InteropServices;

public class NovaJumbo {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct SHFILEINFO {
        public IntPtr hIcon;
        public int iIcon;
        public uint dwAttributes;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szDisplayName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)]
        public string szTypeName;
    }
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr SHGetFileInfo(string pszPath, uint dwFileAttributes,
        ref SHFILEINFO psfi, uint cbFileInfo, uint uFlags);
    [DllImport("shell32.dll")]
    public static extern int SHGetImageList(int iImageList, ref Guid riid, out IntPtr ppv);
    [DllImport("comctl32.dll")]
    public static extern IntPtr ImageList_GetIcon(IntPtr himl, int i, uint flags);

    public static Icon GetJumbo(string path) {
        SHFILEINFO shfi = new SHFILEINFO();
        SHGetFileInfo(path, 0, ref shfi, (uint)Marshal.SizeOf(shfi), 0x000004000);
        Guid iid = new Guid("46EB5926-582E-4017-9FDF-E8998DAA0950");
        IntPtr himl;
        if (SHGetImageList(4, ref iid, out himl) != 0) return null;
        IntPtr hicon = ImageList_GetIcon(himl, shfi.iIcon, 1);
        if (hicon == IntPtr.Zero) return null;
        return Icon.FromHandle(hicon);
    }

    public static Icon GetAssoc(string path) {
        SHFILEINFO shfi = new SHFILEINFO();
        IntPtr res = SHGetFileInfo(path, 0, ref shfi, (uint)Marshal.SizeOf(shfi), 0x100);
        if (shfi.hIcon == IntPtr.Zero) return null;
        return Icon.FromHandle(shfi.hIcon);
    }
}
"@
Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing

$ws = $null
try { $ws = New-Object -ComObject WScript.Shell } catch {}

function Resolve-Target($p) {
    if ($p.ToLower().EndsWith('.lnk')) {
        try {
            $sc = $ws.CreateShortcut($p)
            if ($sc.TargetPath -and (Test-Path -LiteralPath $sc.TargetPath)) {
                return $sc.TargetPath
            }
        } catch {}
    }
    return $p
}

$paths = @()
try { $paths = $PathsJson | ConvertFrom-Json } catch { exit }

$results = @{}
foreach ($p in $paths) {
    try {
        $resolved = Resolve-Target $p
        $icon = $null

        # 1. Jumbo (256x256) — BEST for .lnk, folders, exe, dll
        try { $icon = [NovaJumbo]::GetJumbo($resolved) } catch {}

        # 2. Association icon (SHGetFileInfo) — for .zip, .pdf, .docx, etc.
        if ($icon -eq $null) {
            try { $icon = [NovaJumbo]::GetAssoc($resolved) } catch {}
        }

        # 3. ExtractAssociatedIcon — last resort
        if ($icon -eq $null) {
            try { $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($resolved) } catch {}
        }

        if ($icon -eq $null) { $results[$p] = $null; continue }

        $bmp = $icon.ToBitmap()
        $out = New-Object System.Drawing.Bitmap($TargetSize, $TargetSize)
        $g = [System.Drawing.Graphics]::FromImage($out)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.Clear([System.Drawing.Color]::Transparent)

        $ratio = [Math]::Min($TargetSize / $bmp.Width, $TargetSize / $bmp.Height)
        $nw = [int]($bmp.Width * $ratio)
        $nh = [int]($bmp.Height * $ratio)
        $ox = [int](($TargetSize - $nw) / 2)
        $oy = [int](($TargetSize - $nh) / 2)
        $g.DrawImage($bmp, $ox, $oy, $nw, $nh)
        $g.Dispose()

        $hash = [System.BitConverter]::ToString(
            [System.Security.Cryptography.MD5]::Create().ComputeHash(
                [System.Text.Encoding]::UTF8.GetBytes("v7|$p|$TargetSize")
            )
        ).Replace('-','').ToLower()
        $file = Join-Path $CacheDir "$hash.png"

        $out.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
        $out.Dispose()
        $bmp.Dispose()
        $icon.Dispose()

        $results[$p] = $file
    } catch {
        $results[$p] = $null
    }
}

$results | ConvertTo-Json -Compress