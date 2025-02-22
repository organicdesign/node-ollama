import ollama from '../../src/browser.js'

async function main() {
  // Tokenize some text
  const tokResponse = await ollama.tokenize({
    model: 'llama3.2',
    text: 'Why is the sky blue?'
  })
  
  console.log('Tokens from model:', tokResponse.tokens)

  // Detokenize the tokens back to text
  const detokResponse = await ollama.detokenize({
    model: 'llama3.2', 
    tokens: tokResponse.tokens
  })

  console.log('Text from model:', detokResponse.text)
}

main().catch(console.error)
