#!/usr/bin/env python3

import nltk
import sys
import os

def download_nltk_resources():
    # Create a directory to store NLTK data if it doesn't exist
    nltk_data_dir = os.path.expanduser('~/nltk_data')
    if not os.path.exists(nltk_data_dir):
        os.makedirs(nltk_data_dir, exist_ok=True)
        print(f"Created NLTK data directory at {nltk_data_dir}")
    
    # Ensure NLTK uses this directory
    nltk.data.path.append(nltk_data_dir)
    
    # List of required resources
    required_resources = [
        'punkt',           # Sentence tokenizer
        'stopwords',       # Common stopwords
        'averaged_perceptron_tagger',  # For POS tagging
        'wordnet',         # Lexical database
        'omw-1.4'          # Open Multilingual WordNet
    ]
    
    print(f"Downloading NLTK resources to {nltk_data_dir}")
    for resource in required_resources:
        print(f"Downloading {resource}...")
        try:
            nltk.download(resource, download_dir=nltk_data_dir, quiet=False)
            print(f"Successfully downloaded {resource}")
        except Exception as e:
            print(f"Error downloading {resource}: {e}")
    
    # Download all punkt models to ensure punkt_tab availability
    try:
        print("Ensuring punkt tokenizer models are available...")
        tokenizer = nltk.data.load('tokenizers/punkt/english.pickle')
        print("Successfully loaded punkt models")
    except Exception as e:
        print(f"Error loading punkt models: {e}")
        print("Attempting to download all resources...")
        try:
            nltk.download('all', download_dir=nltk_data_dir, quiet=False)
            print("Downloaded all NLTK resources to ensure availability")
        except Exception as e2:
            print(f"Error downloading all resources: {e2}")
            print("Please manually run the following command in your terminal:")
            print("python -m nltk.downloader all")
    
    # Verify availability of critical resources
    print("\nVerifying resources:")
    all_available = True
    for resource in required_resources:
        try:
            if resource == 'punkt':
                nltk.data.find(f'tokenizers/punkt/english.pickle')
                print(f"✓ {resource} (english) is available")
            else:
                nltk.data.find(resource)
                print(f"✓ {resource} is available")
        except LookupError as e:
            print(f"✗ {resource} is NOT available: {e}")
            all_available = False
    
    # Special check for punkt_tab
    try:
        nltk.data.find('tokenizers/punkt_tab/english/')
        print("✓ punkt_tab (english) is available")
    except LookupError:
        try:
            # This is a workaround to handle punkt_tab
            from nltk.tokenize.punkt import PunktLanguageVars
            print("✓ PunktLanguageVars is available (punkt_tab alternative)")
        except Exception as e:
            print(f"✗ punkt_tab is NOT available and alternative failed: {e}")
            all_available = False
    
    if all_available:
        print("\nAll required NLTK resources are available!")
    else:
        print("\nSome resources could not be verified. Running the lexical diversity evaluation may fail.")
        print("Consider running 'python -m nltk.downloader all' to download all NLTK resources.")
    
    return all_available

if __name__ == "__main__":
    success = download_nltk_resources()
    sys.exit(0 if success else 1)
