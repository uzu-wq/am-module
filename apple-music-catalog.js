const MODULE = {
  id: "apple-music-catalog",
  name: "Apple Music Catalog",
  version: "1.0.0",
  labels: ["APPLE MUSIC", "PREVIEWS", "ALBUMS"],

  storefront: "US",
  defaultLimit: 25,

  _artwork(url, size = 600) {
    if (!url) return "";
    return String(url).replace(/100x100bb\.(jpg|png|webp)/i, `${size}x${size}bb.$1`);
  },

  _track(item) {
    return {
      id: String(item.trackId || ""),
      title: item.trackName || "Unknown title",
      artist: item.artistName || "Unknown artist",
      album: item.collectionName || "",
      duration: item.trackTimeMillis ? Math.round(item.trackTimeMillis / 1000) : 0,
      albumCover: this._artwork(item.artworkUrl100),
      streamUrl: item.previewUrl || "",
      previewUrl: item.previewUrl || "",
      source: "Apple/iTunes catalog",
      sourceUrl: item.trackViewUrl || item.collectionViewUrl || "",
      audioQuality: "PREVIEW",
      isPreview: true,
      trackNumber: item.trackNumber || null,
      discNumber: item.discNumber || null,
      releaseDate: item.releaseDate || null
    };
  },

  _album(item) {
    return {
      id: `itunes-album:${item.collectionId}`,
      collectionId: String(item.collectionId || ""),
      title: item.collectionName || "Unknown album",
      name: item.collectionName || "Unknown album",
      artist: item.artistName || "Unknown artist",
      albumCover: this._artwork(item.artworkUrl100),
      artwork: this._artwork(item.artworkUrl100),
      trackCount: item.trackCount || 0,
      releaseDate: item.releaseDate || null,
      genre: item.primaryGenreName || "",
      url: item.collectionViewUrl || "",
      source: "Apple/iTunes catalog"
    };
  },

  async _request(url) {
    const response = await fetch(url, {
      headers: { "Accept": "application/json" }
    });
    if (!response.ok) {
      throw new Error(`Apple/iTunes catalog request failed (${response.status})`);
    }
    return response.json();
  },

  async searchTracks(query, limit = this.defaultLimit) {
    const term = String(query || "").trim();
    if (!term) return { tracks: [], total: 0 };

    const url = new URL("https://itunes.apple.com/search");
    url.searchParams.set("term", term);
    url.searchParams.set("media", "music");
    url.searchParams.set("entity", "song");
    url.searchParams.set("limit", String(Math.max(1, Math.min(Number(limit) || 25, 200))));
    url.searchParams.set("country", this.storefront);

    const data = await this._request(url.toString());
    const tracks = (data.results || [])
      .filter(item => item.trackId)
      .map(item => this._track(item));

    return { tracks, total: Number(data.resultCount || tracks.length) };
  },
  async searchAlbums(query, limit = this.defaultLimit) {
    const term = String(query || "").trim();
    if (!term) return { albums: [], total: 0 };

    const url = new URL("https://itunes.apple.com/search");
    url.searchParams.set("term", term);
    url.searchParams.set("media", "music");
    url.searchParams.set("entity", "album");
    url.searchParams.set("limit", String(Math.max(1, Math.min(Number(limit) || 25, 200))));
    url.searchParams.set("country", this.storefront);

    const data = await this._request(url.toString());
    const albums = (data.results || [])
      .filter(item => item.collectionId)
      .map(item => this._album(item));

    return { albums, total: Number(data.resultCount || albums.length) };
  },

  async getAlbum(id) {
    const rawId = String(id || "").replace(/^itunes-album:/, "").trim();
    if (!/^\d+$/.test(rawId)) {
      throw new Error("Invalid album ID. Use an album ID returned by searchAlbums().");
    }

    const url = new URL("https://itunes.apple.com/lookup");
    url.searchParams.set("id", rawId);
    url.searchParams.set("entity", "song");
    url.searchParams.set("country", this.storefront);

    const data = await this._request(url.toString());
    const results = data.results || [];
    const albumItem = results.find(item => item.wrapperType === "collection");
    const trackItems = results
      .filter(item => item.wrapperType === "track" && item.kind === "song")
      .sort((a, b) => {
        const disc = (a.discNumber || 1) - (b.discNumber || 1);
        return disc || (a.trackNumber || 0) - (b.trackNumber || 0);
      });

    const album = albumItem ? this._album(albumItem) : {
      id: `itunes-album:${rawId}`,
      collectionId: rawId,
      title: trackItems[0]?.collectionName || "Unknown album",
      name: trackItems[0]?.collectionName || "Unknown album",
      artist: trackItems[0]?.artistName || "Unknown artist",
      albumCover: this._artwork(trackItems[0]?.artworkUrl100),
      trackCount: trackItems.length,
      source: "Apple/iTunes catalog"
    };

    return {
      album,
      tracks: trackItems.map(item => this._track(item))
    };
  },

  async getTrackStreamUrl(id, quality = "HIGH") {
    const rawId = String(id || "").trim();
    if (!/^\d+$/.test(rawId)) {
      throw new Error("Invalid track ID.");
    }

    const url = new URL("https://itunes.apple.com/lookup");
    url.searchParams.set("id", rawId);
    url.searchParams.set("country", this.storefront);

    const data = await this._request(url.toString());
    const item = (data.results || []).find(result => result.trackId);
    if (!item) throw new Error("Track not found in the Apple/iTunes catalog.");

    const track = this._track(item);
    if (!track.previewUrl) {
      throw new Error("No preview audio is available for this track.");
    }

    return {
      streamUrl: track.previewUrl,
      track: {
        ...track,
        audioQuality: "PREVIEW",
        requestedQuality: quality,
        isPreview: true
      }
    };
  },

  async getArtist(id) {
    const rawId = String(id || "").replace(/^itunes-artist:/, "").trim();
    if (!/^\d+$/.test(rawId)) throw new Error("Invalid artist ID.");

    const url = new URL("https://itunes.apple.com/lookup");
    url.searchParams.set("id", rawId);
    url.searchParams.set("entity", "album");
    url.searchParams.set("country", this.storefront);

    const data = await this._request(url.toString());
    const results = data.results || [];
    const artistItem = results.find(item => item.wrapperType === "artist");
    const albums = results
      .filter(item => item.wrapperType === "collection")
      .map(item => this._album(item));

    return {
      artist: artistItem ? {
        id: `itunes-artist:${artistItem.artistId}`,
        name: artistItem.artistName || artistItem.name || "Unknown artist",
        url: artistItem.artistLinkUrl || ""
      } : { id: `itunes-artist:${rawId}`, name: albums[0]?.artist || "Unknown artist" },
      albums
    };
  }
};

return MODULE;
