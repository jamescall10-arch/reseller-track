import { useState, useRef } from 'react';

const MAX_PHOTOS = 12;

const styles = {
  wrap:    { display:'flex', flexWrap:'wrap', gap:8, marginTop:6 },
  thumb:   { position:'relative', width:72, height:72, borderRadius:6, overflow:'hidden', border:'1px solid #30363d', flexShrink:0 },
  img:     { width:'100%', height:'100%', objectFit:'cover', display:'block' },
  remove:  { position:'absolute', top:2, right:2, width:18, height:18, borderRadius:3, background:'rgba(0,0,0,0.7)', border:'none', color:'#f85149', cursor:'pointer', fontSize:11, lineHeight:1, display:'flex', alignItems:'center', justifyContent:'center', padding:0 },
  addBtn:  { width:72, height:72, border:'1px dashed #30363d', borderRadius:6, background:'transparent', color:'#8b949e', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, fontSize:11, flexShrink:0 },
  spinner: { width:72, height:72, border:'1px solid #30363d', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', color:'#8b949e', fontSize:11, flexShrink:0 },
  error:   { fontSize:11, color:'#f85149', marginTop:4 },
  hint:    { fontSize:10, color:'#6e7681', marginTop:4 },
};

export default function PhotoUpload({ photos = [], onChange, maxPhotos = MAX_PHOTOS }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState('');
  const inputRef = useRef(null);

  const handleFiles = async (files) => {
    const remaining = maxPhotos - photos.length;
    const toUpload  = Array.from(files).slice(0, remaining);
    if (!toUpload.length) return;

    setUploading(true);
    setError('');

    try {
      // Get a fresh signed upload signature from our server
      const sigRes = await fetch('/api/cloudinary/signature', { method: 'POST' });
      if (!sigRes.ok) throw new Error('Could not get upload signature');
      const { timestamp, signature, apiKey, cloudName, folder } = await sigRes.json();

      const uploaded = await Promise.all(toUpload.map(async (file) => {
        const form = new FormData();
        form.append('file',      file);
        form.append('api_key',   apiKey);
        form.append('timestamp', timestamp);
        form.append('signature', signature);
        form.append('folder',    folder);

        const uploadRes = await fetch(
          `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
          { method: 'POST', body: form }
        );

        if (!uploadRes.ok) throw new Error('Upload failed');
        const data = await uploadRes.json();
        return data.secure_url;
      }));

      onChange([...photos, ...uploaded]);
    } catch (e) {
      console.error('Photo upload error:', e);
      setError('Upload failed — please try again');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removePhoto = (idx) => {
    onChange(photos.filter((_, i) => i !== idx));
  };

  const canAdd = photos.length < maxPhotos && !uploading;

  return (
    <div>
      <div style={styles.wrap}>
        {photos.map((url, i) => (
          <div key={url} style={styles.thumb}>
            <img src={url} alt={`Photo ${i + 1}`} style={styles.img}/>
            <button type="button" style={styles.remove} onClick={() => removePhoto(i)} title="Remove photo">✕</button>
          </div>
        ))}

        {uploading && (
          <div style={styles.spinner}>
            <span>⏳</span>
          </div>
        )}

        {canAdd && (
          <button
            type="button"
            style={styles.addBtn}
            onClick={() => inputRef.current?.click()}
            title={`Add photo (${photos.length}/${maxPhotos})`}
          >
            <span style={{ fontSize: 20 }}>📷</span>
            <span>Add photo</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)}
      />

      {error && <div style={styles.error}>{error}</div>}
      <div style={styles.hint}>
        {photos.length}/{maxPhotos} photos · JPG, PNG or WEBP · eBay requires at least 1 photo to list
      </div>
    </div>
  );
}
