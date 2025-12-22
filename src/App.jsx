import { useState, useRef, useEffect } from 'react'
import { CreateWebWorkerMLCEngine } from '@mlc-ai/web-llm'

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

    const summary = `The current weather for "${name}, ${country}" is ${current.temperature_2m}°C, humidity: ${
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

  const [input, setInput] = useState('')
  const [response, setResponse] = useState('')

  const [isGenerating, setIsGenerating] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isThinking, setIsThinking] = useState(false)

  const modelName = 'Phi-3.5-mini-instruct-q4f16_1-MLC'

  const worker = useRef(null)

  useEffect(() => {
    window.speechSynthesis.getVoices()
  }, [])

  const loadModel = async () => {
    setStatus('Initializing worker...')

    if (!worker.current) {
      worker.current = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
    }

    try {
      const engineInstance = await CreateWebWorkerMLCEngine(worker.current, modelName, {
        initProgressCallback: (info) => {
          setStatus(info.text)
        },
      })

      setEngine(engineInstance)
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

  const handleLocationClick = () => {
    if (!navigator.geolocation) {
      alert('Your browser does not support geolocation')
      return
    }

    setIsThinking(true)
    setInput('Querying your current location...')

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
        setInput('')
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
      setInput('')
    }
  }

  const handleSend = async () => {
    if (!engine || !input) return
    stopSpeaking()

    setIsGenerating(true)
    setResponse('')

    const userQuestion = `[USER-QUESTION]: ${input}`

    const isWeatherQuery = /weather|temperature|rain|sun|forecast|clima/i.test(userQuestion)

    let contextData = ''

    if (isWeatherQuery) {
      setIsThinking(true)

      try {
        const extractionReply = await engine.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: `You are a city name extractor. You do not answer questions about weather. You only extract the city name in English.
              
              Examples:
              
              User: "Clima en Ciudad de México",
              Assistant: "Mexico City"

              User: "What is the weather in London?",
              Assistant: "London"
              
              User: "Is it raining in Paris?",
              Assistant: "Paris"
              
              User: "Tell me a joke",
              Assistant: "UNKNOWN"
              
              Return ONLY the city name in English without any additional text or symbols.`,
            },
            { role: 'user', content: userQuestion },
          ],
          temperature: 0,
          max_tokens: 20,
        })

        let city = extractionReply.choices[0].message.content.trim()
        city = city.replace(/The city is /i, '').replace(/\.$/, '')

        console.log('Ciudad detectada (Raw):', city)

        if (city && city !== 'UNKNOWN') {
          setStatus(`Checking weather in ${city}...`)
          const weatherInfo = await getWeather(city)
          if (weatherInfo) {
            contextData = `[REAL-TIME DATA]: ${weatherInfo}`
          }
        }
      } catch (e) {
        console.error('Error fetching weather:', e)
      } finally {
        setIsThinking(false)
        setStatus('Model ready! 🚀')
      }
    }

    // const currentInput = input
    // setInput('')

    try {
      const systemPrompt = {
        role: 'system',
        content: systemPromptForWheaterAsistant,
      }

      console.log('final user question:', userQuestion + contextData)

      const completion = await engine.chat.completions.create({
        messages: [systemPrompt, { role: 'user', content: `${userQuestion} ${contextData}` }],
        temperature: 0.7,
        stream: true,
      })

      let fullText = ''

      for await (const chunk of completion) {
        const delta = chunk.choices[0]?.delta?.content || ''
        fullText += delta
        setResponse((prev) => prev + delta)
      }
      speak(fullText)
    } catch (e) {
      console.error(e)
      setResponse((prev) => prev + '\n[Error generating response]')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Weather AI 🌤️</h1>
      <h4>
        <pre>{modelName}</pre>
      </h4>

      <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        Status: <strong>{status}</strong>
      </div>

      {!engine && (
        <button onClick={loadModel} style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}>
          Load Model
        </button>
      )}

      {status.includes('ready') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask something..."
            style={{ padding: '10px', height: '100px', fontSize: '16px' }}
          />

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleSend}
              disabled={isGenerating || isThinking}
              style={{
                flex: 1,
                padding: '12px',
                cursor: isGenerating || isThinking ? 'not-allowed' : 'pointer',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
              }}
            >
              {isThinking ? 'Searching API...' : isGenerating ? 'Generating...' : 'Get Weather'}
            </button>

            <button
              onClick={handleLocationClick}
              disabled={isGenerating || isThinking}
              style={{
                padding: '12px',
                background: '#28a745', // Verde para diferenciarlo
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '20px',
              }}
              title="Usar mi ubicación GPS"
            >
              📍
            </button>
          </div>

          {response && (
            <>
              <div style={{ padding: '15px', border: '1px solid #ddd', borderRadius: '8px', background: '#fff' }}>
                <p style={{ whiteSpace: 'pre-wrap', marginTop: '10px' }}>{response}</p>
              </div>

              <button
                onClick={() => speak(response)}
                disabled={isSpeaking}
                style={{ padding: '12px', marginTop: '10px', cursor: 'pointer', borderRadius: '4px', border: 'none' }}
              >
                🔊 Read Again
              </button>

              <button
                onClick={stopSpeaking}
                disabled={!isSpeaking}
                style={{
                  padding: '12px',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
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
