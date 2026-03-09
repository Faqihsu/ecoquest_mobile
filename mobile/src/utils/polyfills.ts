import { Buffer } from "buffer";
import "react-native-get-random-values";

// Mock global Buffer
global.Buffer = Buffer;

// Mock global URL if needed (sometimes required by some libraries)
// global.URL = URL;
