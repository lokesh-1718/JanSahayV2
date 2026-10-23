import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface DispatchMapProps {
  batches: any[];
  shelters: any[];
  riders: any[];
  deliveries: any[];
  onSelectDelivery?: (id: string) => void;
  onSelectShelter?: (id: string) => void;
}

type MapStyle = 'dark' | 'streets' | 'satellite';

export const DispatchMap: React.FC<DispatchMapProps> = ({
  batches,
  shelters,
  riders,
  deliveries,
  onSelectDelivery,
  onSelectShelter,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayersRef = useRef<L.LayerGroup | null>(null);
  const markerLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const [currentStyle, setCurrentStyle] = useState<MapStyle>('dark');

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Center on Central Delhi (Connaught Place)
    const map = L.map(mapContainerRef.current, {
      center: [28.6328, 77.2195],
      zoom: 13,
      zoomControl: true,
      attributionControl: false,
    });

    const tileLayers = L.layerGroup().addTo(map);
    const markerLayerGroup = L.layerGroup().addTo(map);

    tileLayersRef.current = tileLayers;
    markerLayerGroupRef.current = markerLayerGroup;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Tile Layers when currentStyle or token changes
  useEffect(() => {
    const tileGroup = tileLayersRef.current;
    if (!tileGroup) return;

    tileGroup.clearLayers();

    const mapboxToken = (import.meta as any).env?.VITE_MAPBOX_TOKEN || (import.meta as any).env?.VITE_MAP_API_KEY;

    if (mapboxToken && currentStyle === 'dark') {
      // Mapbox Dark v11 when user provided a token
      L.tileLayer(
        `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`,
        {
          maxZoom: 19,
          tileSize: 512,
          zoomOffset: -1,
        },
      ).addTo(tileGroup);
    } else if (currentStyle === 'dark') {
      // Free Esri Dark Gray Canvas — High quality dark basemap, 100% free with NO API key needed
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 16,
          attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
        },
      ).addTo(tileGroup);

      // Dark Gray reference labels (streets, districts, landmarks)
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 16,
        },
      ).addTo(tileGroup);
    } else if (currentStyle === 'streets') {
      // Standard OpenStreetMap Streets — 100% free with NO API key needed
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(tileGroup);
    } else if (currentStyle === 'satellite') {
      // Esri Satellite Imagery + Boundary overlays — 100% free with NO API key needed
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 18,
          attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye',
        },
      ).addTo(tileGroup);

      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 18,
        },
      ).addTo(tileGroup);
    }
  }, [currentStyle]);

  // Update Markers & Polylines when props change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = markerLayerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();
    const bounds = L.latLngBounds([]);

    // 1. Pickup Locations (Donation Batches)
    const pickupLocation = batches[0]?.pickupLocation?.coordinates || [77.2195, 28.6328];
    const pickupLatLng: L.LatLngTuple = [pickupLocation[1], pickupLocation[0]];
    bounds.extend(pickupLatLng);

    const pickupIcon = L.divIcon({
      className: 'custom-map-marker',
      html: `
        <div style="
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #0284c7;
          border: 3px solid #38bdf8;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 16px rgba(56, 189, 248, 0.6);
          color: white;
          font-weight: bold;
          font-size: 16px;
        ">📦</div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    const activeBatchCount = batches.filter(
      (b) => b.status === 'AVAILABLE' || b.status === 'PARTIALLY_ALLOCATED',
    ).length;
    L.marker(pickupLatLng, { icon: pickupIcon })
      .bindPopup(`
        <div style="color: #0f172a; padding: 4px; font-family: sans-serif;">
          <h4 style="margin: 0 0 4px; font-size: 14px; font-weight: 700;">📍 Central Dispatch Hub</h4>
          <p style="margin: 0; font-size: 12px; color: #475569;">Connaught Place Logistics Center</p>
          <p style="margin: 4px 0 0; font-size: 12px; font-weight: 600; color: #0284c7;">
            ${activeBatchCount} Active Donation Batches
          </p>
        </div>
      `)
      .addTo(layerGroup);

    // 2. Shelters
    shelters.forEach((shelter) => {
      if (!shelter.location?.coordinates) return;
      const latLng: L.LatLngTuple = [shelter.location.coordinates[1], shelter.location.coordinates[0]];
      bounds.extend(latLng);

      const isFull = shelter.status === 'FULL';
      const isClosed = shelter.status === 'CLOSED';
      const bgColor = isFull ? '#ef4444' : isClosed ? '#64748b' : '#10b981';
      const borderColor = isFull ? '#f87171' : isClosed ? '#94a3b8' : '#34d399';
      const emoji = isFull ? '🛑' : isClosed ? '🔒' : '🏠';

      const shelterIcon = L.divIcon({
        className: 'custom-map-marker',
        html: `
          <div style="
            width: 34px;
            height: 34px;
            border-radius: 8px;
            background: ${bgColor};
            border: 2px solid ${borderColor};
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 12px ${isFull ? 'rgba(239, 68, 68, 0.5)' : 'rgba(16, 185, 129, 0.4)'};
            color: white;
            font-size: 15px;
          ">${emoji}</div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const percent = Math.round((shelter.currentOccupancy / Math.max(1, shelter.capacity)) * 100);
      const marker = L.marker(latLng, { icon: shelterIcon })
        .bindPopup(`
          <div style="color: #0f172a; padding: 4px; font-family: sans-serif; min-width: 160px;">
            <h4 style="margin: 0 0 4px; font-size: 14px; font-weight: 700;">${shelter.name}</h4>
            <div style="font-size: 12px; margin-bottom: 4px;">
              Status: <span style="font-weight: 700; color: ${bgColor};">${shelter.status}</span>
            </div>
            <div style="font-size: 11px; color: #475569;">
              Occupancy: ${shelter.currentOccupancy} / ${shelter.capacity} (${percent}%)
            </div>
            <div style="margin-top: 6px; font-size: 11px;">
              Facilities: 
              ${shelter.facilities?.cleanWater ? '💧 Water ' : ''}
              ${shelter.facilities?.cookingFuel ? '🔥 Fuel ' : ''}
              ${shelter.facilities?.refrigeration ? '❄️ Fridge' : ''}
            </div>
          </div>
        `)
        .addTo(layerGroup);

      if (onSelectShelter) {
        marker.on('click', () => onSelectShelter(shelter._id));
      }
    });

    // 3. Riders
    riders.forEach((rider) => {
      if (!rider.currentLocation?.coordinates) return;
      const latLng: L.LatLngTuple = [rider.currentLocation.coordinates[1], rider.currentLocation.coordinates[0]];
      bounds.extend(latLng);

      const isAfk = rider.status === 'AFK';
      const isBusy = rider.status === 'BUSY' || rider.status === 'RESERVED';
      const riderColor = isAfk ? '#ef4444' : isBusy ? '#8b5cf6' : '#10b981';

      const riderIcon = L.divIcon({
        className: 'custom-map-marker',
        html: `
          <div style="
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: #1e293b;
            border: 2px solid ${riderColor};
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 10px ${riderColor};
            font-size: 13px;
          ">🏍️</div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      L.marker(latLng, { icon: riderIcon })
        .bindPopup(`
          <div style="color: #0f172a; padding: 4px; font-family: sans-serif;">
            <h4 style="margin: 0 0 2px; font-size: 13px; font-weight: 700;">
              ${rider.userId?.name || `Rider #${rider._id.slice(-4)}`}
            </h4>
            <div style="font-size: 11px; color: #475569;">
              Status: <span style="font-weight: 700; color: ${riderColor};">${rider.status}</span>
            </div>
            <div style="font-size: 11px; color: #475569;">
              Capacity: ${rider.vehicleCapacity} meals
            </div>
          </div>
        `)
        .addTo(layerGroup);
    });

    // 4. Delivery Polylines
    deliveries.forEach((delivery) => {
      if (!delivery.destinationLocation?.coordinates) return;
      const destLatLng: L.LatLngTuple = [
        delivery.destinationLocation.coordinates[1],
        delivery.destinationLocation.coordinates[0],
      ];

      const isRerouted = delivery.rerouteCount > 0;
      const isDelivered = delivery.status === 'DELIVERED';
      const isInTransit = delivery.status === 'IN_TRANSIT';

      // Polyline color
      const lineColor = isDelivered ? '#10b981' : isRerouted ? '#f59e0b' : isInTransit ? '#a855f7' : '#38bdf8';
      const dashArray = isDelivered ? undefined : '6, 8';

      // Draw route polyline from pickup to destination
      const polyline = L.polyline([pickupLatLng, destLatLng], {
        color: lineColor,
        weight: isRerouted ? 4 : 3,
        dashArray,
        opacity: isDelivered ? 0.4 : 0.85,
      }).addTo(layerGroup);

      polyline.bindPopup(`
        <div style="color: #0f172a; padding: 4px; font-family: sans-serif;">
          <h4 style="margin: 0 0 4px; font-size: 13px; font-weight: 700;">
            Delivery #${delivery._id.slice(-6)}
          </h4>
          <div style="font-size: 11px;">Quantity: <b>${delivery.quantity}</b> items</div>
          <div style="font-size: 11px;">Status: <b>${delivery.status}</b></div>
          ${isRerouted ? '<div style="font-size: 11px; color: #d97706; font-weight: 700;">⚠️ Rerouted Delivery</div>' : ''}
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">ETA: ~${Math.round(delivery.estimatedMinutes || 0)} min</div>
        </div>
      `);

      if (onSelectDelivery) {
        polyline.on('click', () => onSelectDelivery(delivery._id));
      }
    });

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [batches, shelters, riders, deliveries, onSelectDelivery, onSelectShelter]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '480px', borderRadius: '12px', overflow: 'hidden' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%', minHeight: '480px' }} />

      {/* Style Selector Controls */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '8px',
          padding: '4px',
          display: 'flex',
          gap: '4px',
          zIndex: 1000,
        }}
      >
        <button
          className="btn btn-sm"
          style={{
            padding: '4px 8px',
            fontSize: '0.72rem',
            background: currentStyle === 'dark' ? 'var(--accent-primary)' : 'transparent',
            color: currentStyle === 'dark' ? '#fff' : 'var(--text-muted)',
            border: 'none',
          }}
          onClick={() => setCurrentStyle('dark')}
        >
          🌙 Dark
        </button>
        <button
          className="btn btn-sm"
          style={{
            padding: '4px 8px',
            fontSize: '0.72rem',
            background: currentStyle === 'streets' ? 'var(--accent-primary)' : 'transparent',
            color: currentStyle === 'streets' ? '#fff' : 'var(--text-muted)',
            border: 'none',
          }}
          onClick={() => setCurrentStyle('streets')}
        >
          🗺️ Streets
        </button>
        <button
          className="btn btn-sm"
          style={{
            padding: '4px 8px',
            fontSize: '0.72rem',
            background: currentStyle === 'satellite' ? 'var(--accent-primary)' : 'transparent',
            color: currentStyle === 'satellite' ? '#fff' : 'var(--text-muted)',
            border: 'none',
          }}
          onClick={() => setCurrentStyle('satellite')}
        >
          🛰️ Satellite
        </button>
      </div>

      {/* Floating Map Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: '16px',
          right: '16px',
          background: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '8px',
          padding: '10px 14px',
          fontSize: '0.78rem',
          color: '#e2e8f0',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>
          Spatial Legend
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>📦</span> <span>Pickup Hub (Central CP)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#10b981' }}>🏠</span> <span>Shelter Open</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#ef4444' }}>🛑</span> <span>Shelter Full</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🏍️</span> <span>Rider (Green=Available, Purple=Busy)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '14px', height: '3px', background: '#38bdf8', display: 'inline-block' }}></span>{' '}
          <span>Standard Route</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '14px', height: '3px', background: '#f59e0b', display: 'inline-block' }}></span>{' '}
          <span>Rerouted Path</span>
        </div>
      </div>
    </div>
  );
};
