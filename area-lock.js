// Area Lock System

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2-lat1); 
  var dLon = deg2rad(lon2-lon1); 
  var a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  var d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI/180)
}

export async function checkAccess(bypass = false) {
  const urlParams = new URLSearchParams(window.location.search);
  const debug = urlParams.get('debug');
  
  // DOM Elements
  const deniedEl = document.getElementById('access-denied');
  const statusEl = document.getElementById('location-status');

  if (!deniedEl || !statusEl) {
      console.warn("Area Lock: Required DOM elements (#access-denied, #location-status) not found.");
      return;
  }

  // Debug Bypass
  // Check URL param OR path for /d shortcut (handled by Vercel rewrites but path remains /d in browser)
  // Also respect the explicit bypass argument
  if (bypass || debug === 'true' || debug === '1' || window.location.pathname === '/d') {
     deniedEl.style.display = 'none';
     return;
  }
  
  if (!navigator.geolocation) {
    statusEl.innerText = "お使いのブラウザは位置情報をサポートしていません。";
    return;
  }

  try {
    const response = await fetch('areas.json');
    if (!response.ok) throw new Error("Failed to load areas.json");
    const areas = await response.json();
    
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition((position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        
        let allowed = false;
        let minDist = 99999;
        let nearestArea = null;

        for (const area of areas) {
            const dist = getDistanceFromLatLonInKm(lat, lon, area.lat, area.lon);
            // Use area.radius if defined, default to 0.5km
            const radius = area.radius !== undefined ? area.radius : 0.5;
            
            if (dist <= radius) {
                allowed = true;
                break;
            }
            if (dist < minDist) {
                minDist = dist;
                nearestArea = area;
            }
        }
        
        if (allowed) {
           deniedEl.style.display = 'none';
           resolve(true);
        } else {
           if (nearestArea) {
               statusEl.innerHTML = `<strong>${nearestArea.name}</strong>まで <strong>${minDist.toFixed(2)}km</strong> です。<br>エリア外です。`;
           } else {
               statusEl.innerText = "アクセスできません。有効なエリアが見つかりません。";
           }
           resolve(false);
        }
      }, (error) => {
        console.error(error);
        statusEl.innerText = "位置情報を取得できません。位置情報の利用を許可してください。";
        resolve(false);
      }, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });
    });

  } catch (e) {
      console.error(e);
      statusEl.innerText = "システムエラー: エリア設定の読み込みに失敗しました。";
      return false;
  }
}
