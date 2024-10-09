Image Processor

Low-Level Design (LLD) for Image Processing System

1. Overview

The system processes image data from CSV files by:

    Validating the CSV format.
    Asynchronously processing images by compressing them by 50% of their original quality.
    Storing the processed image URLs in a database.
    Responding with a request ID immediately and providing APIs to check processing status.

2. Components

    Image Processing Service Interaction: Handles compression of images.
    Webhook Handling: Processes callbacks once images are processed.
    Database Interaction: Tracks processing requests and stores processed image URLs.
    Asynchronous Worker: Processes images and interacts with external services.
    API Endpoints:
        Upload API: Accepts CSV file and returns a unique request ID.
        Status API: Allows querying the processing status using the request ID.

3. System Architecture Diagram

This diagram outlines the system's flow:

+-----------------+   CSV Upload    +-----------------------+
|                 | --------------> |                       |
|  Client         |                 |   Upload API          |
|                 | <-------------- |   (Async)             |
|                 |   Request ID     |                       |
+-----------------+                  +----------+------------+
                                             |
                                             v
                                  +----------------------+
                                  | Database             |
                                  | Stores request ID,   |
                                  | product info, status |
                                  +----------------------+
                                             |
                                             v
                                 +----------------------+
                                 | Asynchronous Worker  |
                                 | Processes images and |
                                 | interacts with       |
                                 | Image Service        |
                                 +----------------------+
                                             |
                                             v
                                 +---------------------+
                                 | Image Processing    |
                                 | Service             |
                                 | Compress images and |
                                 | store in cloud      |
                                 +---------------------+
                                             |
                                             v
                                   +-----------------+
                                   | Webhook         |
                                   | Handles image   |
                                   | processing done |
                                   +-----------------+
                                             |
                                             v
                                  +---------------------+
                                  | Status API          |
                                  | User can query via  |
                                  | Request ID          |
                                  +---------------------+


4. Components Description
4.1 Image Processing Service Interaction

    Function: Processes images by downloading, compressing, and uploading them to cloud storage.
    Flow:
        Downloads input image from the URL.
        Compresses it by 50%.
        Uploads compressed image to cloud storage.
        Returns the processed image URL.

4.2 Webhook Handling

    Function: Triggered once image processing is complete, and updates the request status in the database.
    Flow:
        Once all images are processed, the image processing service calls a webhook URL.
        The webhook updates the database with the output image URLs.

4.3 Database Interaction

    Function: Stores request status, input/output image URLs, and product details.
    Schema:
        requests table: Tracks status and request ID.
        products table: Stores product name, input image URLs, and output image URLs.

4.4 Asynchronous Worker

    Function: Manages the image processing workflow. It:
        Fetches the input image URLs from the CSV file.
        Initiates image compression using the Image Processing Service.
        Updates the database after processing is complete.

4.5 API Endpoints

    Upload API:
        Method: POST
        Endpoint: /upload
        Request Body: CSV file.
        Response: Unique request ID.
        Function: Validates CSV, stores initial request info in the database, and triggers the asynchronous worker for image processing.
    Status API:
        Method: GET
        Endpoint: /status/{requestId}
        Response: Current status (e.g., processing, completed) and URLs for input/output images (if complete).

5. Database Schema
requests Table:

    id: Primary Key, auto-incremented.
    request_id: UUID, unique identifier for each processing request.
    status: Enum (pending, processing, completed, failed).
    created_at: Timestamp.
    updated_at: Timestamp.

products Table:

    id: Primary Key, auto-incremented.
    request_id: Foreign Key to requests.
    product_name: String.
    input_image_urls: Text, comma-separated list of input image URLs.
    output_image_urls: Text, comma-separated list of output image URLs (once processed).
    created_at: Timestamp.
    updated_at: Timestamp.

6. API Documentation
Upload API

    URL: /upload
    Method: POST
    Request:
        Content-Type: multipart/form-data
        CSV File:

        csv

    Serial Number,Product Name,Input Image Urls
    1,SKU1,https://image1.jpg,https://image2.jpg
    2,SKU2,https://image3.jpg,https://image4.jpg

Response:

json

    {
      "request_id": "unique-request-id"
    }

Status API

    URL: /status/{requestId}
    Method: GET
    Response (In Progress):

    json

{
  "status": "processing"
}

Response (Completed):

json

    {
      "status": "completed",
      "data": [
        {
          "product_name": "SKU1",
          "input_image_urls": "https://image1.jpg, https://image2.jpg",
          "output_image_urls": "https://output1.jpg, https://output2.jpg"
        }
      ]
    }

7. Asynchronous Workers Documentation

    Function:
        Receives the request ID and the CSV file data.
        Downloads each image, compresses it by 50%, and uploads the result to cloud storage.
        Once all images are processed, stores the output URLs in the database.
    Workflow:
        Worker fetches unprocessed images based on the request ID.
        For each image:
            Download the image.
            Compress it.
            Upload to cloud storage.
            Store the output URL.
        Once all images are processed, the status is updated to completed.
        Trigger the webhook once the entire job is done.

8. Webhook Flow

    Webhook URL: /webhook
    Function:
        Image processing service triggers this endpoint once all images are processed.
        The system updates the request status to completed and stores the output image URLs.