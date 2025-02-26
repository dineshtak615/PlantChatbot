import './style.css';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { marked } from 'marked';

// Initialize Gemini API
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('Missing Gemini API key. Please add VITE_GEMINI_API_KEY to your .env file');
}
const genAI = new GoogleGenerativeAI(apiKey);

const app = document.querySelector('#app');

// Create chat interface
app.innerHTML = `
  <div class="max-w-4xl mx-auto p-4">
    <h1 class="text-2xl font-bold mb-4">plant Chat Bot</h1>
    <div id="chat-messages" class="mb-4 h-[60vh] overflow-y-auto"></div>
    <div class="flex gap-2">
      <input type="file" id="image-upload" accept="image/*" class="hidden">
      <button id="upload-btn" class="px-4 py-2 bg-gray-200 rounded-lg">
        📷 Upload Image
      </button>
      <input 
        type="text" 
        id="user-input" 
        class="flex-1 p-2 border rounded-lg"
        placeholder="Type your message..."
      >
      <button id="send-btn" class="px-4 py-2 bg-blue-500 text-white rounded-lg">
        Send
      </button>
    </div>
  </div>
`;

const messagesContainer = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-btn');
const imageUpload = document.getElementById('image-upload');
const uploadButton = document.getElementById('upload-btn');

let currentImage = null;

// Add message to chat
function addMessage(content, isUser = false, imageUrl = null) {
  const messageDiv = document.createElement('div');
  messageDiv.className = message ${isUser ? 'user-message' : 'bot-message'};
  
  try {
    if (imageUrl) {
      messageDiv.innerHTML = `
        <div>${marked.parse(content)}</div>
        <img src="${imageUrl}" alt="Uploaded image" onerror="this.style.display='none'">
      `;
    } else {
      messageDiv.innerHTML = marked.parse(content);
    }
  } catch (error) {
    console.error('Error parsing message:', error);
    messageDiv.textContent = content; // Fallback to plain text if parsing fails
  }
  
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Handle file upload
uploadButton.addEventListener('click', () => {
  imageUpload.click();
});

// Convert file to base64
async function fileToGenerativePart(file) {
  if (!file) {
    throw new Error('No file provided');
  }
  
  if (!file.type.startsWith('image/')) {
    throw new Error('File must be an image');
  }
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        const base64Data = reader.result.split(',')[1];
        if (!base64Data) {
          reject(new Error('Failed to process image data'));
          return;
        }
        
        resolve({
          inlineData: {
            data: base64Data,
            mimeType: file.type
          }
        });
      } catch (error) {
        reject(new Error(Failed to process image: ${error.message}));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

imageUpload.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  try {
    const reader = new FileReader();
    reader.onload = (e) => {
      currentImage = e.target.result;
      addMessage('Image uploaded successfully', true, currentImage);
    };
    reader.onerror = (error) => {
      console.error('Error reading file:', error);
      addMessage('Failed to upload image. Please try again.');
    };
    reader.readAsDataURL(file);
  } catch (error) {
    console.error('Error handling file upload:', error);
    addMessage('Failed to process image. Please try again.');
  }
});

// Handle sending messages
async function handleSend() {
  const message = userInput.value.trim();
  if (!message && !currentImage) return;

  try {
    // Disable send button while processing
    sendButton.disabled = true;
    sendButton.textContent = 'Sending...';
    
    // Add user message to chat
    addMessage(message, true, currentImage);

    let result;
    
    if (currentImage) {
      // If there's an image, use Gemini Vision
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const imagePart = await fileToGenerativePart(imageUpload.files[0]);
      if (!imagePart) {
        throw new Error('Failed to process image');
      }
      
      const prompt = message || "What's in this image?";
      result = await model.generateContent([prompt, imagePart]);
    } else {
      // Text-only chat using Gemini Pro
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      result = await model.generateContent(message);
    }

    const response = await result.response;
    const botResponse = response.text();
    
    if (!botResponse) {
      throw new Error('Empty response from Gemini API');
    }
    
    addMessage(botResponse);

  } catch (error) {
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    let errorMessage = 'Sorry, there was an error processing your request. ';
    if (error.message.includes('API key')) {
      errorMessage += 'Please check your API key configuration.';
    } else if (error.message.includes('image')) {
      errorMessage += 'There was a problem with the image. Please try a different image.';
    } else {
      errorMessage += error.message;
    }
    
    addMessage(errorMessage);
  } finally {
    // Re-enable send button
    sendButton.disabled = false;
    sendButton.textContent = 'Send';
    
    // Clear input and current image
    userInput.value = '';
    currentImage = null;
    imageUpload.value = '';
  }
}

sendButton.addEventListener('click', handleSend);
userInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});
