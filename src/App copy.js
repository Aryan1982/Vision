import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import "./App.css";

let socket;

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [caption, setCaption] = useState('Initializing...');
  const [ocrText, setOcrText] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [isSocketActive, setIsSocketActive] = useState(false);
  const [selectedOcrMethod, setSelectedOcrMethod] = useState('PaddleOCR');
  const [isCaptionEnabled, setIsCaptionEnabled] = useState(true);
  const [isOcrEnabled, setIsOcrEnabled] = useState(false);
  const [isSpeechEnabled, setIsSpeechEnabled] = useState(false);
  const [recognizedFaces, setRecognizedFaces] = useState([]);

  function StartSocket() {
    if (!isSocketActive) {
      socket = io('http://localhost:8080', {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
      setIsSocketActive(true);

      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(err => console.error('Error accessing the camera:', err));

      socket.on('connect', () => {
        console.log('Connected to server');
        setConnectionStatus('Connected');
      });

      socket.on('disconnect', () => {
        console.log('Disconnected from server');
        setConnectionStatus('Disconnected');
      });

      socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        setConnectionStatus(`Connection error: ${error.message}`);
      });

      socket.on('caption_result', result => {
        if (result.caption) {
          console.log('Caption:', result.caption);
          setCaption(result.caption);
          speakCaption(result.caption);
        }
      });

      socket.on('ocr_result', result => {
        if (result.text) {
          console.log('OCR result:', result.text);
          setOcrText(result.text);
        }
      });
    }
  }

  const recognizeFace = async () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;

      // Capture the current video frame to the canvas
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);

      // Convert canvas to a data URL (image format)
      const imageData = canvas.toDataURL('image/jpeg');

      // Create a Blob from the image data
      const blob = await fetch(imageData).then(res => res.blob());

      // Create FormData and append the Blob as 'image'
      const formData = new FormData();
      formData.append('image', blob, 'frame.jpg');

      // Send POST request to the /recognize API
      try {
        const response = await axios.post('http://localhost:8080/recognize', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        console.log('Recognized faces:', response.data.recognized_faces);
        setRecognizedFaces(response.data.recognized_faces);
      } catch (error) {
        console.error('Error recognizing faces:', error);
      }
    }
  };

  const speakCaption = (text) => {
    const utterance = new SpeechSynthesisUtterance(`There is ${text}`);
    speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    let lastImageSent = 0;

    const captureFrame = () => {
      const now = Date.now();
      if (videoRef.current && canvasRef.current && socket?.connected) {
        const canvas = canvasRef.current;
        const video = videoRef.current;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);

        if ((isCaptionEnabled || isOcrEnabled) && now - lastImageSent >= 5000) {
          const imageData = canvas.toDataURL('image/jpeg');

          if (isCaptionEnabled) {
            socket.emit('request_caption', { image: imageData });
          }

          lastImageSent = now;
        }
      }

      requestAnimationFrame(captureFrame);
    };

    requestAnimationFrame(captureFrame);

    return () => {
      lastImageSent = 0;
    };
  }, [isCaptionEnabled, isOcrEnabled]);

  function stopSocket() {
    if (socket) {
      socket.disconnect();
      setIsSocketActive(false);
      console.log('Disconnected from server');
      setConnectionStatus('Disconnected');
    }
  }

  const handleCaptionToggle = (e) => {
    setIsCaptionEnabled(e.target.checked);
  };

  const handleOcrToggle = (e) => {
    setIsOcrEnabled(e.target.checked);
  };

  // const handleSpeechRecognitionToggle = () => {
  //   if (isSpeechActive) {
  //     recognition.stop();
  //     setIsSpeechActive(false);
  //   } else {
  //     recognition.start();
  //     setIsSpeechActive(true);
  //   }
  // }

  return (
    <div className="app-container">
      <h1>Live Camera Captioning, OCR, and Face Recognition</h1>
      <div className="status-container">
        <span>Connection status:</span>
        <span className={`status ${connectionStatus === 'Connected' ? 'status-connected' : 'status-disconnected'}`}>
          {connectionStatus}
        </span>
      </div>
      <div className="video-container">
        <video ref={videoRef} autoPlay />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
      <div className="controls-container">
        <div className="caption-controls">
          <label>
            <input
              type="checkbox"
              checked={isCaptionEnabled}
              onChange={handleCaptionToggle}
              disabled={!isSocketActive}
            />
            Enable Captioning
          </label>
          {isCaptionEnabled && (
            <div className="caption-container">
              <div className="caption-label">Caption:</div>
              <div className="caption-text">{"There is " + caption}</div>
            </div>
          )}
        </div>
        <div className="speech-controls">
          <label>
            <input
              type="checkbox"
              checked={isSpeechEnabled}
              onChange={(e) => setIsSpeechEnabled(e.target.checked)}
              disabled={!isSocketActive}
            />
            Enable Speech
          </label>
        </div>
        <div className="ocr-controls">
          <label>
            <input
              type="checkbox"
              checked={isOcrEnabled}
              onChange={handleOcrToggle}
              disabled={!isSocketActive}
            />
            Enable OCR
          </label>
          {isOcrEnabled && (
            <>
              <div className="ocr-method-container">
                <label htmlFor="ocr-method">OCR Method:</label>
                <select
                  id="ocr-method"
                  value={selectedOcrMethod}
                  onChange={(e) => setSelectedOcrMethod(e.target.value)}
                  disabled={!isSocketActive}
                >
                  <option value="PaddleOCR">PaddleOCR</option>
                </select>
              </div>
              <div className="ocr-container">
                <div className="ocr-label">OCR Text:</div>
                <div className="ocr-text">{ocrText}</div>
              </div>
            </>
          )}
        </div>
        <div className='face-recognition-box'>
          <button
            onClick={recognizeFace}
            disabled={!isSocketActive}
            className='face-recognition-controls'
          >
            Recognize Face
          </button>
          {recognizedFaces.length > 0 && (
            <div className="recognized-faces">
              <h3>Recognized Faces:</h3>
              <div className="recognized-faces">
                {recognizedFaces.map((face, index) => (
                  <span className='faces' key={index}>{face}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="button-container">
        <button
          className="start-button"
          onClick={StartSocket}
          disabled={isSocketActive}
        >
          Start socket
        </button>
        <button
          className="stop-button"
          onClick={stopSocket}
          disabled={!isSocketActive}
        >
          Stop socket
        </button>
      </div>
    </div>
  );
}
