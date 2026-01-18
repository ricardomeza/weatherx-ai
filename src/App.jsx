import { useState, useRef, useEffect } from 'react'
import { CreateWebWorkerMLCEngine, prebuiltAppConfig } from '@mlc-ai/web-llm'

const systemPromptForWheaterAsistant = `
  You are a helpful Weather Assistant.

  If no [REAL-TIME DATA] is provided, answer normally.

  If [REAL-TIME DATA] is provided use it to give a friendly description about the today's weather. Include also the temperatures and weather description for the morning, afternoon and night, include an outfit recommendation for the day, for example "jaket or sweater" if it will be cold, "rain coat" if it will rain, "sun uv protection" if it will be sunny, etc.

  IMPORTANT: your final response must be in the same language of the user's question provided in [USER-QUESTION].
  
  IMPORTANT: Ommit any greeting or introduction in your response. 
  
  IMPORTANT: follow this example format in your response, replace the example data with the real data:
    "The current temperature in your location is 17 degrees Celsius, it will be a sunny day. The humidity is 48%. The wind speed is 4 km/h from the west. The average temperature will be 20 degrees Celsius. The forecast for the day is as follows:
    - At morning, the temperature will be 17 degrees, sunny.
    - At afternoon, the temperature will be 20 degrees, party cloudy.
    - At night, the temperature will be 17 degrees, party cloudy.
    Get ready for a sunny day with warm temperatures in the morning and afternoon, but cool temperatures at night!
    I recommend comfortable, lightweight clothing, but bring a light jacket or sweater."
`

const weatherCodeMap = {
  0: 'Clear skies',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Cloudy',
  45: 'Fog',
  48: 'Fog with frost',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Heavy drizzle',
  56: 'Light freezing drizzle',
  57: 'Heavy freezing drizzle',
  61: 'Light rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Light snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Small hail',
  80: 'Light showers',
  81: 'Moderate showers',
  82: 'Vicious showers',
  85: 'Light snow showers',
  86: 'Showers of Heavy snow',
  95: 'Thunderstorm',
  96: 'Light hailstorm',
  99: 'Heavy hailstorm',
}

const getWeatherDesc = (code) => weatherCodeMap[code] || 'Unknown'

const getWeather = async (locationOrCoordinates) => {
  try {
    let latitude, longitude, name, country

    if (typeof locationOrCoordinates === 'object' && locationOrCoordinates.lat) {
      console.log('📍 Usando coordenadas GPS...')
      latitude = locationOrCoordinates.lat
      longitude = locationOrCoordinates.lon
      name = 'Tu ubicación actual'
      country = 'GPS'
    } else {
      console.log(`🔍 Buscando coordenadas para: ${locationOrCoords}...`)
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        locationOrCoords,
      )}&count=1&language=es&format=json`
      const geoRes = await fetch(geoUrl)
      const geoData = await geoRes.json()

      if (!geoData.results || geoData.results.length === 0) {
        console.log('City not found')
        return null
      }

      latitude = geoData.results[0].latitude
      longitude = geoData.results[0].longitude
      name = geoData.results[0].name
      country = geoData.results[0].country
    }

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code&timezone=auto&forecast_days=1`

    const weatherRes = await fetch(weatherUrl)
    const weatherData = await weatherRes.json()

    const current = weatherData.current
    const hourly = weatherData.hourly

    const getHourlyTemp = (targetHour) => {
      const index = hourly.time.findIndex((t) => t.endsWith(`T${targetHour}:00`))
      if (index !== -1) {
        const temp = hourly.temperature_2m[index]
        const code = hourly.weather_code[index]
        return `${temp}°C, ${getWeatherDesc(code)}`
      }
      return 'N/A'
    }

    const summary = `The current weather for your location is ${current.temperature_2m}°C, humidity: ${
      current.relative_humidity_2m
    }%, wind: ${current.wind_speed_10m} km/h.
    Today's Forecast:
    - Morning (09:00): ${getHourlyTemp('09')}
    - Afternoon (15:00): ${getHourlyTemp('15')}
    - Night (21:00): ${getHourlyTemp('21')}
    `.trim()

    console.log('Datos de Open-Meteo:', summary)
    return summary
  } catch (e) {
    console.error('Open-Meteo API Error:', e)
    return null
  }
}

const getVoice = (languageCode) => {
  const voices = window.speechSynthesis.getVoices()
  return voices.find((voice) => voice.lang.startsWith(languageCode))
}

function App() {
  const [status, setStatus] = useState('Waiting')
  const [engine, setEngine] = useState(null)
  const [selectedModel, setSelectedModel] = useState('Phi-3.5-mini-instruct-q4f16_1-MLC')
  const currentModelRef = useRef(null)

  const [response, setResponse] = useState('')

  const [isGenerating, setIsGenerating] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isThinking, setIsThinking] = useState(false)

  const worker = useRef(null)

  useEffect(() => {
    window.speechSynthesis.getVoices()
  }, [])

  const handleModelChange = (e) => {
    const newModel = e.target.value
    setSelectedModel(newModel)

    // Reset state
    setEngine(null)
    setStatus('Waiting')
    setResponse('')
    setIsGenerating(false)
    setIsSpeaking(false)
    setIsThinking(false)
    stopSpeaking()

    // Terminate worker if it exists
    if (worker.current) {
      worker.current.terminate()
      worker.current = null
    }
  }

  const loadModel = async (modelId) => {
    setStatus('Initializing worker...')

    if (!worker.current) {
      worker.current = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
    }

    try {
      const engineInstance = await CreateWebWorkerMLCEngine(worker.current, modelId, {
        initProgressCallback: (info) => {
          setStatus(info.text)
        },
      })

      setEngine(engineInstance)
      currentModelRef.current = modelId
      setStatus('Model ready! 🚀')
    } catch (e) {
      console.error(e)
      setStatus('Error: ' + e.message)
    }
  }

  const speak = (text) => {
    if (!text) return
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)

    utterance.rate = 1
    utterance.pitch = 1
    utterance.volume = 1

    const voice = getVoice('es')
    if (voice) utterance.voice = voice

    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)

    window.speechSynthesis.speak(utterance)
  }

  const stopSpeaking = () => {
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }

  const handleLocationClick = async () => {
    if (!navigator.geolocation) {
      alert('Your browser does not support geolocation')
      return
    }

    if (!engine || currentModelRef.current !== selectedModel) {
      await loadModel(selectedModel)
    }

    setIsThinking(true)
    setStatus('Querying your current location...')

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        const weatherInfo = await getWeather({ lat: latitude, lon: longitude })

        const userPrompt = '[USER-QUESTION]: ¿Cuál es el clima en mi ubicación actual?'

        generateResponse(userPrompt, weatherInfo)
      },
      (error) => {
        console.error(error)
        setIsThinking(false)
        alert('Cannot get your location. Please check permissions.')
      },
    )
  }

  const generateResponse = async (userQuestion, weatherContext) => {
    try {
      const contextData = weatherContext ? `[REAL-TIME DATA] ${weatherContext}` : ''

      const systemPrompt = {
        role: 'system',
        content: systemPromptForWheaterAsistant,
      }

      const completion = await engine.chat.completions.create({
        messages: [
          systemPrompt,
          {
            role: 'user',
            content: `${userQuestion} ${contextData}`,
          },
        ],
        temperature: 0.7,
        stream: true,
      })

      let fullText = ''
      setResponse('')
      setStatus('Done')
      setIsThinking(false)
      for await (const chunk of completion) {
        const delta = chunk.choices[0]?.delta?.content || ''
        fullText += delta
        setResponse((prev) => prev + delta)
      }
      speak(fullText)
    } catch (e) {
      console.error(e)
      setResponse('Error generating response.')
    } finally {
      setIsGenerating(false)
      setIsThinking(false)
    }
  }

  return (
    <div
      style={{
        padding: '20px',
        fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
        maxWidth: '600px',
        margin: '0 auto',
        minHeight: '100vh',
        backgroundColor: '#121212',
        color: '#e0e0e0',
      }}
    >
      <h1 style={{ color: '#ffffff' }}>Weather AI 🌤️</h1>
      <h4>
        <select
          value={selectedModel}
          onChange={handleModelChange}
          disabled={isGenerating || isThinking || status.includes('Initializing') || status.includes('Loading')}
          style={{
            padding: '10px',
            fontSize: '14px',
            borderRadius: '6px',
            backgroundColor: '#1e1e1e',
            color: '#e0e0e0',
            border: '1px solid #333',
          }}
        >
          {prebuiltAppConfig.model_list.map((model) => (
            <option key={model.model_id} value={model.model_id}>
              {model.model_id}
            </option>
          ))}
        </select>
      </h4>

      <div
        style={{
          background: '#1e1e1e',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '1px solid #333',
        }}
      >
        Status: <strong style={{ color: '#4caf50' }}>{status}</strong>
      </div>

      {!engine && (
        <button
          onClick={() => loadModel(selectedModel)}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            cursor: 'pointer',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
          }}
        >
          Load Model
        </button>
      )}

      {engine && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleLocationClick}
              disabled={isGenerating || isThinking}
              style={{
                padding: '12px',
                background: isGenerating || isThinking ? '#444' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: isGenerating || isThinking ? 'not-allowed' : 'pointer',
                fontSize: '18px',
                fontWeight: '600',
                boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
              }}
              title="Get my daily weather & style!"
            >
              Get my daily weather & style!
            </button>
          </div>

          {response && (
            <>
              <div
                style={{
                  padding: '20px',
                  border: '1px solid #333',
                  borderRadius: '12px',
                  background: '#1e1e1e',
                  color: '#e0e0e0',
                  lineHeight: '1.6',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
                }}
              >
                <p style={{ whiteSpace: 'pre-wrap', marginTop: '10px' }}>{response}</p>
              </div>

              <button
                onClick={() => speak(response)}
                disabled={isSpeaking}
                style={{
                  padding: '12px',
                  marginTop: '15px',
                  cursor: isSpeaking ? 'not-allowed' : 'pointer',
                  borderRadius: '6px',
                  border: '1px solid #333',
                  backgroundColor: isSpeaking ? '#333' : '#2d2d2d',
                  color: '#e0e0e0',
                }}
              >
                🔊 Read Again
              </button>

              <button
                onClick={stopSpeaking}
                disabled={!isSpeaking}
                style={{
                  padding: '12px',
                  border: '1px solid #333',
                  borderRadius: '6px',
                  cursor: !isSpeaking ? 'not-allowed' : 'pointer',
                  backgroundColor: !isSpeaking ? '#2d2d2d' : '#d32f2f',
                  color: 'white',
                }}
              >
                Stop Audio 🔇
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default App
