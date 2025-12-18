import { useState, useRef } from 'react'
import { CreateWebWorkerMLCEngine } from '@mlc-ai/web-llm'

function App() {
  const [status, setStatus] = useState('Waiting')
  const [engine, setEngine] = useState(null)

  const [input, setInput] = useState('')
  const [response, setResponse] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  const modelName = 'Llama-3.2-1B-Instruct-q4f16_1-MLC'

  const worker = useRef(null)

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

  const handleSend = async () => {
    if (!engine || !input) return
    setIsGenerating(true)
    setResponse('')

    const messages = [{ role: 'user', content: input }]

    try {
      const completion = await engine.chat.completions.create({
        messages,
        temperature: 0.5,
        stream: true,
      })

      let fullText = ''

      for await (const chunk of completion) {
        const delta = chunk.choices[0]?.delta?.content || ''
        fullText += delta
        setResponse((prev) => prev + delta)
      }
    } catch (e) {
      console.error(e)
      setResponse((prev) => prev + '\n[Error interrupting generation]')
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

          <button
            onClick={handleSend}
            disabled={isGenerating}
            style={{
              padding: '12px',
              cursor: isGenerating ? 'not-allowed' : 'pointer',
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
            }}
          >
            {isGenerating ? 'Generating...' : 'Send Message'}
          </button>

          {response && (
            <div style={{ padding: '15px', border: '1px solid #ddd', borderRadius: '8px', background: '#fff' }}>
              <strong>AI Response:</strong>
              <p style={{ whiteSpace: 'pre-wrap', marginTop: '10px' }}>{response}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App
